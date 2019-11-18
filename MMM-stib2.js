Module.register("MMM-stib2", {
  defaults: {
    apiToken: "",
    stops: []
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

    // Start an update now.
    this.update();

    // Schedule updates
    setInterval(() => {
      this.update();
    }, 20000);
  },

  update: function() {
    // Clear possible previous data.
    this.stibData = {};
    this.messages = {};

    const urlTimes = "https://opendata-api.stib-mivb.be/OperationMonitoring/4.0/PassingTimeByPoint/";
    const ids = this.getIds();
    const promises = [];

    // Batch ids per 10 as we can only request 10 at the time from the API
    for (let i = 0; i < ids.length; i += 10) {
      const slice = ids.slice(i, i + 10).join("%2C");
      const sliceUrl = urlTimes + slice;
      promises.push(this.fetch(sliceUrl).then(response => this.processData(response)));
    }

    // Wait for all the waiting times requests to be processed, then get the messages.
    Promise.all(promises).then(() => {
      // getLineIds returns lineIds of the loaded data, hence we must wait for the times data to be available
      const urlMessages = "https://opendata-api.stib-mivb.be/OperationMonitoring/4.0/MessageByLine/";
      const lineIds = this.getLineIds();
      const promises = [];

      // Batch ids per 10 as we can only request 10 at the time from the API
      for (let i = 0; i < lineIds.length; i += 10) {
        const slice = lineIds.slice(i, i + 10).join("%2C");
        const sliceUrl = urlMessages + slice;
        promises.push(this.fetch(sliceUrl).then(response => this.processMessages(response)));
      }

      // Wait for all message requests to be processed.
      return Promise.all(promises);
    }).then(() => this.updateDom(this.config.animationSpeed));
  },

  fetch: function(url) {
    return fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + this.config.apiToken,
      },
    }).then(this.handleErrors).then(r => r.json()).catch(console.error);
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
    passageTime.innerHTML = this.getTime(currentTime, passage);
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
