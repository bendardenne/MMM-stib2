/* global Module */

/* Magic Mirror
 * Module: MMM-stib2
 *
 * By Benoît Dardenne
 * MIT Licensed.
 */

Module.register("MMM-stib2", {
	defaults: {
		updateInterval: 20000,
		apiToken: "",
		stops: []
	},

	requiresVersion: "2.1.0", // Required version of MagicMirror

	start: function() {
		var self = this;

		//Flag for check if module is loaded
		this.loaded = false;

		// this.stibData = {};
		this.messages = {};

		// Start an update now.
		self.update();

		// Schedule updates
		setInterval(() => {
			self.update();
		}, this.config.updateInterval);

		// this.animations = [];
		this.symbols = {
			"TEMPS THÉORIQUE": "clock",
			"TEMPS INDISP.": "exclamation-circle",
			"FIN DE SERVICE": "bus",
		};
	},

	update: function() {
		var self = this;
		var urlTimes = "https://opendata-api.stib-mivb.be/OperationMonitoring/4.0/PassingTimeByPoint/" + this.getIds().join("%2C");

		self.fetch(urlTimes)
			.then(response => self.processData(response))
			.then(() => {
				// getLineIds returns lineIds of the loaded data, hence we must wait for the times data to be available
				var urlMessages = "https://opendata-api.stib-mivb.be/OperationMonitoring/4.0/MessageByLine/" + this.getLineIds().join("%2C");
				return self.fetch(urlMessages);
			})
			.then(response => self.processMessages(response))
			.then(() => self.updateDom(self.config.animationSpeed));
	},

	fetch: function(url) {
		return fetch(url, {
			headers: {
				Accept: "application/json",
				Authorization: "Bearer " + this.config.apiToken,
			},
		}).then(self.handleErrors).then(r => r.json()).catch(console.error);
		//Not sure the error handling is ideal here
	},

	handleErrors(response) {
		if (!response.ok) {
			throw Error(response.statusText);
		}
		return response;
	},

	processData: function(response) {
		var self = this;

		this.stibData = {};

		var idToName = {};
		for (var i = 0; i < this.config.stops.length; i++) {
			var stop = this.config.stops[i];
			for (var j = 0; j < stop.id.length; j++) {
				idToName[stop.id[j]] = stop.name;
			}
		}

		for (var i = 0; i < response.points.length; i++) {
			var point = response.points[i];

			for (var j = 0; j < point.passingTimes.length; j++) {
				var passage = point.passingTimes[j];
				var pointData = this.stibData[idToName[point.pointId]] || {};
				var lineData = pointData[passage.lineId] || {};
				if (!passage.destination) {
					continue;
				}
				var routeData = lineData[passage.destination.fr] || [];

				routeData.push({
					time: passage.expectedArrivalTime,
					message: passage.message
				});

				lineData[passage.destination.fr] = routeData;
				pointData[passage.lineId] = lineData;
				this.stibData[idToName[point.pointId]] = pointData;
			}
		}

		console.log(this.stibData);
	},

	processMessages: function(response) {
		var messages = response.messages;
		var stopIds = this.getIds();

		// Keep messages which relate to a point in the config.
		var filtered = messages.filter(message => message.points.some(point => stopIds.includes(point.id)));

		this.messages = {};

		for (var i = 0; i < filtered.length; i++) {
			var current = filtered[i];
			current.lines.forEach(line => this.messages[line.id] = current.content);
		}

		// console.log(this.messages);
	},

	getDom: function() {
		var self = this;
		var wrapper = document.createElement("div");
		wrapper.classList.add("stib-table", "small");

		if (this.stibData) {
			return this.getTable();
		} else {
			// TODO improve
			wrapper = document.createElement("div");
			wrapper.innerHTML = "no data";
		}

		return wrapper;
	},

	getTable: function() {
		var currentTime = new Date();

		var table = document.createElement("div");
		table.classList.add("stib-table", "small");

		var rowIndex = 1;
		var seen = new Set();

		for (var stopName in this.stibData) {
			var stop = this.stibData[stopName];
			var stopSpan = document.createElement("span");
			stopSpan.innerHTML = stopName;
			stopSpan.classList.add("stib-stopname");
			stopSpan.style.gridRowStart = rowIndex;
			table.appendChild(stopSpan);

			for (var line in stop) {
				// Don't show the same line on multiple stops
				if (seen.has(line)) {
					continue;
				}

				var messageFrom = rowIndex;
				var lineClass = "stib-" + stopName.replace(/[^a-zA-Z0-9]/g, "") + "-" + line;

				var lineDiv = document.createElement("div");
				var lineSpan = document.createElement("span");
				lineSpan.innerHTML = line;
				lineSpan.classList.add("stib-linenumber");
				lineDiv.classList.add("stib-linenumber-container");

				var icon = document.createElement("span");
				icon.classList.add("stib-linenumber-icon");

				lineDiv.appendChild(lineSpan);
				lineDiv.appendChild(icon);

				var rowsForLine = Object.keys(stop[line]).length;
				lineDiv.style.gridRow = rowIndex + " / span " + rowsForLine;
				table.appendChild(lineDiv);

				for (var route in stop[line]) {
					var routeSpan = document.createElement("span");
					routeSpan.innerHTML = route.toLowerCase();
					routeSpan.classList.add("stib-routename", lineClass);
					routeSpan.style.gridRow = rowIndex + " / span 1";
					table.appendChild(routeSpan);

					var div = this.getTimeDiv(stop[line][route][0], currentTime);
					div.style.gridRow = rowIndex + " / span 1";
					div.classList.add(lineClass);
					table.appendChild(div);

					div = this.getTimeDiv(stop[line][route][1], currentTime);
					div.style.gridRow = rowIndex + " / span 1";
					div.classList.add(lineClass, "dimmed");
					table.appendChild(div);

					rowIndex++;
				}

				if (this.messages[line]) {
					icon.classList.add("fas", "fa-bullhorn");
					table.appendChild(this.getMessage(this.messages[line][0].text[0], messageFrom, rowIndex));
					table.querySelectorAll("." + lineClass).forEach(e => e.classList.add("stib-content-fade"));
				}

				var gap = document.createElement("span");
				gap.classList.add("stib-routeseparator");
				gap.style.gridRow = rowIndex + " / span 1";
				table.appendChild(gap);

				rowIndex++;
				seen.add(line);
			}

			stopSpan.style.gridRowEnd = rowIndex - 1;

			var gap = document.createElement("span");
			gap.classList.add("stib-stopseparator");
			gap.style.gridRow = rowIndex + " / span 1";
			table.appendChild(gap);
			rowIndex++;
		}

		// FIXME Find a better way to do this :( We don't want the separators after the last row
		table.removeChild(table.lastChild);
		table.removeChild(table.lastChild);

		return table;
	},

	getTimeDiv: function(passage, currentTime) {
		var passageDiv = document.createElement("div");
		var passageTime = document.createElement("span");
		passageTime.innerHTML = this.getTime(currentTime, passage);
		passageDiv.classList.add("stib-times");
		passageDiv.appendChild(passageTime);

		var icon = document.createElement("span");
		icon.classList.add("fas", "stib-time-icon");
		passageDiv.appendChild(icon);

		if (passage && passage.message) {
			var text = passage.message.fr;
			var symbol = this.symbols[text];
			if (!symbol) {
				console.log(text);
			} else {
				// Special case where we need to stack two icons
				if (symbol === "bus") {
					icon.classList.add("fa-stack");
					var bus = document.createElement("span");
					bus.classList.add("fas", "fa-bus", "fa-stack-1x", "stib-time-icon");

					var slash = document.createElement("span");
					slash.classList.add("fas", "fa-slash", "fa-stack-1x", "stib-time-icon");

					icon.appendChild(bus);
					icon.appendChild(slash);
				} else {
					icon.classList.add("fa-" + symbol);
				}
			}
		}

		return passageDiv;
	},

	getMessage: function(message, from, upTo) {
		var showMessage = false;
		var messageSpan = document.createElement("span");
		messageSpan.classList.add("stib-message", "stib-message-fade");
		messageSpan.style.gridRow = from + " / " + upTo;
		messageSpan.innerHTML = message.fr.toLowerCase();
		return messageSpan;
	},

	getTime: function(currentTime, passage) {
		if (passage === undefined || passage.time === undefined) {
			return " ";
		}
		var diff = Date.parse(passage.time) - currentTime;
		diff = Math.max(diff, 0);
		return Math.floor(diff / (1000 * 60));
	},

	getIds: function() {
		var ids = [];

		for (var i = 0; i < this.config.stops.length; i++) {
			ids = ids.concat(this.config.stops[i].id);
		}

		return ids;
	},

	getLineIds: function() {
		var ids = new Set();

		for (stopName in this.stibData) {
			ids.add(Object.keys(this.stibData[stopName]).forEach(line => ids.add(line)));
		}

		return Array.from(ids);
	},

	getScripts: function() {
		return [];
	},

	getStyles: function() {
		return [
			"MMM-stib2.css", "font-awesome.css"
		];
	},

	getTranslations: function() {
		return {
			en: "translations/en.json",
			fr: "translations/fr.json",
		};
	}
});
