Module.register("MMM-stib2", {
  defaults: {
    pollInterval: "20000",
    apiToken: "",
    stops: [],
    DisplayArrivalTime: "both", // Display actual arrival time beside waiting time
    timeFormat: "24h"
  },

  requiresVersion: "2.1.0", // Required version of MagicMirror

  /* Maps STIB messages to a font awesome icon id. This icon is shown next to
     to the relevant waiting time. */
  symbols: {
    "TEMPS THÉORIQUE": "clock",
    "TEMPS INDISP.": "exclamation-circle",
    "DERNIER PASSAGE": "bus",
    "VÉHICULE BLOQUÉ": "car-crash",
  },

  start: function() {
    this.stibData = {};
    this.messages = {};
    this.colors = {};
    this.fetchColors()
      .then(() => this.update())
      .then(() => {
	// Convert pollInterval to a number if it's a string representation of a number
	// and ensure it falls within the 20000 to 60000 range to avoid issues with the API.
	// If not, set it to the default value (20000).
	let validatedPollInterval = parseInt(this.config.pollInterval, 10);

	// Check if the conversion result is NaN or if the value is out of the desired range
	if (isNaN(validatedPollInterval) || validatedPollInterval < 20000 || validatedPollInterval > 60000) {
	  validatedPollInterval = 20000; // Set to default value if out of range or not a valid number
	  console.log("Invalid or out-of-range pollInterval configuration detected. Resetting to default (20000 ms).");
	}

	// Now we can safely populate pollInterval with the desired value
	this.config.pollInterval = validatedPollInterval;

	// Schedule updates
        setInterval(() => {
          this.update();
        }, this.config.pollInterval);
      });
  },

  fetchColors: function() {
    return fetch("modules/MMM-stib2/colors.json")
      .then(r => r.json())
      .then(colors => this.colors = colors);
  },

  update: function() {
    let urlTimes = `https://data.stib-mivb.be/api/explore/v2.1/catalog/datasets/waiting-time-rt-production/records?apikey=${this.config.apiToken}&where=`;
    const ids = this.getIds();
    const promises = [];

    urlTimes += encodeURIComponent( "pointid IN (" + ids.map(a => '"' + a + '"' ).join(",") + ")" )
    this.fetch(urlTimes).then(response => this.processData(response)).then(() => this.updateDom(this.config.animationSpeed));

    // TODO  fetch traveller info
  },

  fetch: function(url) {
    return fetch(url).then(this.handleErrors).then(r => r.json()).catch(console.error);
    //Not sure the error handling is ideal here
  },

  handleErrors(response) {
    if (!response.ok) {
      throw Error(response.statusText);
    }
    return response;
  },

  processData: function(response) {
    const idToName = {};
    for (let stop of this.config.stops) {
      for (let id of stop.id) {
        idToName[id] = stop.name;
      }
    }

    this.stibData = {};

    for (var i = 0; i < response.results.length; i++) {
      var point = response.results[i];
      point.passingtimes = JSON.parse(point.passingtimes);

      for (var j = 0; j < point.passingtimes.length; j++) {
        var passage = point.passingtimes[j];
        var pointData = this.stibData[idToName[point.pointid]] || {};
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
        this.stibData[idToName[point.pointid]] = pointData;
      }
    }
  },

  processMessages: function(response) {
    var messages = response.messages;
    var stopIds = this.getIds();

    // Keep messages which relate to a point in the config.
    var filtered = messages.filter(message => message.points.some(point => stopIds.includes(point.id)));

    for (var i = 0; i < filtered.length; i++) {
      var current = filtered[i];
      current.lines.forEach(line => this.messages[line.id] = current.content);
    }
  },

  getDom: function() {
    var wrapper = document.createElement("div");
    wrapper.classList.add("stib-table", "small");

    if (Object.keys(this.stibData).length > 1) {
      return this.getTable();
    } else {
      // TODO improve
      wrapper = document.createElement("div");
      wrapper.innerHTML = "no data";
    }

    return wrapper;
  },

  getTable: function() {
    const currentTime = new Date();

    const table = document.createElement("div");
    table.classList.add("stib-table", "small");

    let rowIndex = 1;
    const seen = new Set();

    const stopsInConfigOrder = this.config.stops.map(s => s.name);
    for (let stopName of stopsInConfigOrder) {
      // const stopName = stopsInConfigOrder[i];
      let stop = this.stibData[stopName];
      let stopSpan = document.createElement("span");
      stopSpan.innerHTML = stopName;
      stopSpan.classList.add("stib-stopname", "dimmed");
      stopSpan.style.gridRowStart = rowIndex;
      table.appendChild(stopSpan);

      for (let line in stop) {
        // Don't show the same line on multiple stops
        if (seen.has(line)) {
          continue;
        }

        const messageFrom = rowIndex;
        const lineClass = "stib-" + stopName.replace(/[^a-zA-Z0-9]/g, "") + "-" + line;

        const lineDiv = document.createElement("div");
        const lineSpan = document.createElement("span");
        lineSpan.innerHTML = line;
        lineSpan.classList.add("stib-linenumber");
        console.log(this.colors[line].COLOR_HEX);
        lineSpan.style.backgroundColor = this.colors[line].COLOR_HEX || "#bbb";
        lineDiv.classList.add("stib-linenumber-container");

        const icon = document.createElement("span");
        icon.classList.add("stib-linenumber-icon");

        lineDiv.appendChild(lineSpan);
        lineDiv.appendChild(icon);

        const rowsForLine = Object.keys(stop[line]).length;
        lineDiv.style.gridRow = rowIndex + " / span " + rowsForLine;
        table.appendChild(lineDiv);

        for (let route in stop[line]) {
          const routeSpan = document.createElement("span");
          routeSpan.innerHTML = route.toLowerCase();
          routeSpan.classList.add("stib-routename", lineClass);
          routeSpan.style.gridRow = rowIndex + " / span 1";
          table.appendChild(routeSpan);

          let div = this.getTimeDiv(stop[line][route][0], currentTime);
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

        const gap = document.createElement("span");
        gap.classList.add("stib-routeseparator");
        gap.style.gridRow = rowIndex + " / span 1";
        table.appendChild(gap);

        rowIndex++;
        seen.add(line);
      }
      table.removeChild(table.lastChild);
      rowIndex--;

      stopSpan.style.gridRowEnd = rowIndex;

      const gap = document.createElement("span");
      gap.classList.add("stib-stopseparator");
      gap.style.gridRow = rowIndex + " / span 1";
      table.appendChild(gap);
      rowIndex++;
    }

    // FIXME Find a better way to do this :( We don't want the separators after the last row
    table.removeChild(table.lastChild);

    return table;
  },

  getTimeDiv: function(passage, currentTime) {
    const passageDiv = document.createElement("div");
    const passageTime = document.createElement("span");

    // Display waiting time, arrival time, or both
    // Maybe a switch would be more efficient than this if cycle???
    if (this.config.DisplayArrivalTime === "true" || this.config.DisplayArrivalTime === "both") {
        let timeString = this.getTimeString(passage, this.config.timeFormat);
        // both is the new default value
        if (this.config.DisplayArrivalTime === "both") {
            let waitingTime = this.getTime(currentTime, passage);
            // Convert waitingTime to a string if it's not - to be able to trim it.
            waitingTime = String(waitingTime).trim();
        if (waitingTime !== "") {
            timeString += " (in " + waitingTime + " min)";
        }
    }

        passageTime.innerHTML = timeString;
  } else if (this.config.DisplayArrivalTime === "false") {
    passageTime.innerHTML = this.getTime(currentTime, passage);
  }

  passageDiv.classList.add("stib-times");
  passageDiv.appendChild(passageTime);

  const icon = document.createElement("span");
  icon.classList.add("fas", "stib-time-icon");
  passageDiv.appendChild(icon);

  if (passage && passage.message) {
    const text = passage.message.fr;
    const symbol = this.symbols[text];
    if (!symbol) {
      console.log(text);
    } else {
      // Special case where we need to stack two icons
      if (symbol === "bus") {
        icon.classList.add("fa-stack");
        const bus = document.createElement("span");
        bus.classList.add("fas", "fa-bus", "fa-stack-1x", "stib-time-icon");

        const slash = document.createElement("span");
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

  formatArrivalTime: function(isoString) {
    if (!isoString) return "";
    const arrivalDate = new Date(isoString);
    const hours = arrivalDate.getHours().toString().padStart(2, '0');
    const minutes = arrivalDate.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  },
 
  getTimeString: function(passage, format) {
    if (!passage || !passage.time) {
      return " "; // Return an empty string if passage time is undefined
    }
 
    const arrivalTime = new Date(passage.time);
    let hours = arrivalTime.getHours();
    let minutes = arrivalTime.getMinutes();
 
    if (format === "12h") {
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // Translate '0' to '12'
      minutes = minutes < 10 ? '0'+minutes : minutes;
      return hours + ':' + minutes + ' ' + ampm;
    } else {
      // 24h format is the default
      minutes = minutes < 10 ? '0'+minutes : minutes;
      return hours + ':' + minutes;
    }
  },
  
  getMessage: function(message, from, upTo) {
    const showMessage = false;
    const messageSpan = document.createElement("span");
    messageSpan.classList.add("stib-message", "stib-message-fade");
    messageSpan.style.gridRow = from + " / " + upTo;
    messageSpan.innerHTML = message.fr.toLowerCase();
    return messageSpan;
  },

  getTime: function(currentTime, passage) {
    if (passage === undefined || passage.time === undefined) {
      return " ";
    }
    let diff = Date.parse(passage.time) - currentTime;
    diff = Math.max(diff, 0);
    return Math.floor(diff / (1000 * 60));
  },

  getIds: function() {
    let ids = [];

    for (let stop of this.config.stops) {
      ids = ids.concat(stop.id);
    }

    return ids;
  },

  getLineIds: function() {
    const ids = new Set();

    for (stopName in this.stibData) {
      Object.keys(this.stibData[stopName]).forEach(line => ids.add(line));
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
    };
  }
});
