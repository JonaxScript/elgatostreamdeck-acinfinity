'use strict';

const API_HOST = 'http://www.acinfinityserver.com';
const CANVAS_SIZE = 144;

class ACInfinityPlugin {
    constructor() {
        this.ws = null;
        this.uuid = null;
        this.contexts = {};
        this.canvas = null;
        this.ctx = null;
    }

    init() {
        this.canvas = document.getElementById('canvas');
        this.canvas.width = CANVAS_SIZE;
        this.canvas.height = CANVAS_SIZE;
        this.ctx = this.canvas.getContext('2d');
        // Clear log from previous session on every startup
        localStorage.removeItem('ac_log');
    }

    connect(port, uuid, registerEvent) {
        this.uuid = uuid;
        this.ws = new WebSocket('ws://127.0.0.1:' + port);

        this.ws.onopen = () => {
            this.send({ event: registerEvent, uuid: uuid });
            this.log('Plugin connected to Stream Deck');
        };

        this.ws.onmessage = (e) => {
            try {
                this.handleMessage(JSON.parse(e.data));
            } catch (err) {
                console.error('[AC∞] Failed to handle message:', err);
            }
        };

        this.ws.onerror = (e) => console.error('[AC∞] WebSocket error:', e);
    }

    // Appends a line to the in-memory session log (localStorage) and the Stream Deck log file
    log(msg) {
        var line = '[' + new Date().toLocaleTimeString() + '] ' + msg;
        // Stream Deck log file
        this.send({ event: 'logMessage', payload: { message: '[AC∞] ' + line } });
        // Session log in localStorage — cleared at startup, so always current session only
        try {
            var entries = JSON.parse(localStorage.getItem('ac_log') || '[]');
            entries.push(line);
            if (entries.length > 200) entries.shift(); // cap at 200 lines
            localStorage.setItem('ac_log', JSON.stringify(entries));
        } catch (e) {}
    }

    // Only runs when debugLog is enabled; forwards to PI for live display
    debug(context, msg, data) {
        var ctxData = this.contexts[context];
        if (!ctxData || !ctxData.settings || !ctxData.settings.debugLog) return;

        var line = msg + (data !== undefined ? ': ' + JSON.stringify(data) : '');
        this.log(line);

        // Send to Property Inspector for live display (if it is open)
        this.send({
            event:   'sendToPropertyInspector',
            action:  'com.acinfinity.sensor.display',
            context: context,
            payload: { type: 'log', message: line }
        });
    }

    send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
        }
    }

    handleMessage(data) {
        var event   = data.event;
        var context = data.context;
        var payload = data.payload;

        switch (event) {
            case 'willAppear':
                this.contexts[context] = {
                    settings: (payload && payload.settings) || {},
                    token: null,
                    timer: null
                };
                this.debug(context, 'willAppear — settings:', this.contexts[context].settings);
                this.startPolling(context);
                break;

            case 'willDisappear':
                this.debug(context, 'willDisappear');
                this.stopPolling(context);
                delete this.contexts[context];
                break;

            case 'didReceiveSettings':
                if (this.contexts[context]) {
                    this.contexts[context].settings = (payload && payload.settings) || {};
                    this.contexts[context].token = null;
                    this.debug(context, 'didReceiveSettings — new settings:', this.contexts[context].settings);
                    this.stopPolling(context);
                    this.startPolling(context);
                }
                break;

            case 'keyDown':
                this.debug(context, 'keyDown — manual refresh');
                this.refresh(context);
                break;

            case 'propertyInspectorDidAppear':
                // PI just opened — send full log history of current session
                this.sendLogHistoryToPI(context);
                break;
        }
    }

    startPolling(context) {
        var ctxData = this.contexts[context];
        if (!ctxData) return;

        var interval = Math.max(10, parseInt(ctxData.settings.refreshInterval) || 30) * 1000;
        this.debug(context, 'Polling started, interval: ' + (interval / 1000) + 's');
        this.refresh(context);
        ctxData.timer = setInterval(() => this.refresh(context), interval);
    }

    stopPolling(context) {
        var ctxData = this.contexts[context];
        if (ctxData && ctxData.timer) {
            clearInterval(ctxData.timer);
            ctxData.timer = null;
        }
    }

    sendLogHistoryToPI(context) {
        var ctxData = this.contexts[context];
        if (!ctxData || !ctxData.settings || !ctxData.settings.debugLog) return;
        try {
            var entries = JSON.parse(localStorage.getItem('ac_log') || '[]');
            if (entries.length > 0) {
                this.send({
                    event:   'sendToPropertyInspector',
                    action:  'com.acinfinity.sensor.display',
                    context: context,
                    payload: { type: 'log_history', messages: entries }
                });
            }
        } catch (e) {}
    }

    getFileConfig() {
        var cfg = window.AC_INFINITY_CONFIG;
        if (cfg &&
            cfg.email    && cfg.email    !== 'deine@email.de' &&
            cfg.password && cfg.password !== 'DeinPasswort') {
            return cfg;
        }
        return null;
    }

    getEffectiveSettings(settings) {
        if (settings && settings.email && settings.password) {
            return settings;
        }
        return this.getFileConfig() || settings || {};
    }

    async login(email, password) {
        var body = 'appEmail=' + encodeURIComponent(email) +
                   '&appPasswordl=' + encodeURIComponent(password.substring(0, 25));

        var res = await fetch(API_HOST + '/api/user/appUserLogin', {
            method: 'POST',
            headers: {
                'User-Agent': 'okhttp/4.12.0',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body
        });

        var json = await res.json();
        if (json.code !== 200) throw new Error('Login failed (code ' + json.code + ')');
        return json.data.appId;
    }

    async fetchDevices(token) {
        var body = 'userId=' + encodeURIComponent(token);

        var res = await fetch(API_HOST + '/api/user/devInfoListAll', {
            method: 'POST',
            headers: {
                'User-Agent': 'okhttp/4.12.0',
                'Content-Type': 'application/x-www-form-urlencoded',
                'token': token
            },
            body: body
        });

        var json = await res.json();
        if (json.code !== 200) throw new Error('Failed to fetch devices (code ' + json.code + ')');
        return json.data;
    }

    async refresh(context) {
        var ctxData = this.contexts[context];
        if (!ctxData) return;

        var settings = this.getEffectiveSettings(ctxData.settings);

        if (!settings.email || !settings.password) {
            this.debug(context, 'No credentials configured');
            this.sendImage(context, this.renderNoConfig());
            return;
        }

        try {
            if (!ctxData.token) {
                this.debug(context, 'Logging in as: ' + settings.email);
                ctxData.token = await this.login(settings.email, settings.password);
                this.debug(context, 'Login successful, token: ' + ctxData.token);
            }

            var devices = await this.fetchDevices(ctxData.token);
            this.debug(context, 'Devices received: ' + (devices ? devices.length : 0), devices);

            var idx    = Math.max(0, parseInt(settings.deviceIndex) || 0);
            var device = (devices && devices[idx]) || (devices && devices[0]);

            if (!device) {
                this.debug(context, 'No device found at index ' + idx);
                this.sendImage(context, this.renderError('No device found'));
                return;
            }

            var info     = device.deviceInfo || device;
            var tempC    = info.temperature / 100;
            var humidity = info.humidity / 100;
            var unit     = settings.tempUnit || 'C';
            var temp     = unit === 'F' ? (tempC * 9 / 5 + 32) : tempC;
            var online   = device.online === 1;
            var fontSize = settings.fontSize || 'medium';

            this.debug(context, 'Device data — temp: ' + tempC + '°C, humidity: ' + humidity + '%, online: ' + online);
            this.sendImage(context, this.renderData(temp, unit, humidity, online, fontSize, settings));

        } catch (err) {
            ctxData.token = null;
            console.error('[AC∞] Refresh error:', err);
            this.debug(context, 'Error details:', err.stack || err.message);
            this.sendImage(context, this.renderError((err.message || 'Unknown error').substring(0, 22)));
        }
    }

    renderData(temp, unit, humidity, online, fontSize, settings) {
        var c = this.ctx, s = CANVAS_SIZE;

        // Each preset: font sizes + y positions for label and value
        // ly1/ty = TEMP label/value, ly2/hy = HUM label/value
        var sizes = {
            small:  { label: 9,  temp: 22, hum: 18, ly1: 36, ty: 72, ly2: 100, hy: 134 },
            medium: { label: 11, temp: 30, hum: 26, ly1: 36, ty: 72, ly2: 100, hy: 134 },
            large:  { label: 13, temp: 38, hum: 32, ly1: 36, ty: 72, ly2: 100, hy: 134 },
            xl:     { label: 9,  temp: 48, hum: 40, ly1: 18, ty: 62, ly2: 86,  hy: 132 }
        };
        var sz;
        if (fontSize === 'custom') {
            var ct = Math.max(10, Math.min(80, parseInt((settings || {}).customTempSize) || 30));
            var ch = Math.max(10, Math.min(70, parseInt((settings || {}).customHumSize)  || 26));
            var big = ct > 38;
            sz = {
                label: Math.max(8, Math.round(ct * 0.3)),
                temp:  ct,
                hum:   ch,
                ly1:   big ? 18 : 36,
                ty:    big ? 62 : 72,
                ly2:   big ? 86 : 100,
                hy:    big ? 132 : 134
            };
        } else {
            sz = sizes[fontSize] || sizes.medium;
        }

        c.clearRect(0, 0, s, s);

        c.fillStyle = '#0d1117';
        c.fillRect(0, 0, s, s);

        c.strokeStyle = '#21262d';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(8, s / 2 + 2);
        c.lineTo(s - 8, s / 2 + 2);
        c.stroke();

        if (!online) {
            c.fillStyle = '#ff4444';
            c.font = 'bold 10px Arial';
            c.textAlign = 'right';
            c.fillText('OFFLINE', s - 8, 14);
        }

        c.fillStyle = '#ff7b7b';
        c.font = 'bold ' + sz.label + 'px Arial';
        c.textAlign = 'left';
        c.fillText('TEMP', 8, sz.ly1);

        c.fillStyle = '#ffffff';
        var tempFontSize = (temp >= 100 && sz.temp > 24) ? sz.temp - 4 : sz.temp;
        c.font = 'bold ' + tempFontSize + 'px Arial';
        c.textAlign = 'center';
        c.fillText(temp.toFixed(1) + '°' + unit, s / 2, sz.ty);

        c.fillStyle = '#7bc8ff';
        c.font = 'bold ' + sz.label + 'px Arial';
        c.textAlign = 'left';
        c.fillText('HUM', 8, sz.ly2);

        c.fillStyle = '#ffffff';
        c.font = 'bold ' + sz.hum + 'px Arial';
        c.textAlign = 'center';
        c.fillText(Math.round(humidity) + '%', s / 2, sz.hy);

        return this.canvas.toDataURL('image/png');
    }

    renderNoConfig() {
        var c = this.ctx, s = CANVAS_SIZE;
        c.clearRect(0, 0, s, s);

        c.fillStyle = '#0d1117';
        c.fillRect(0, 0, s, s);

        c.fillStyle = '#4fc3f7';
        c.font = 'bold 20px Arial';
        c.textAlign = 'center';
        c.fillText('AC', s / 2, 44);

        c.fillStyle = '#555555';
        c.font = '10px Arial';
        c.fillText('config.js or', s / 2, 76);
        c.fillText('settings', s / 2, 92);
        c.fillText('required', s / 2, 108);

        return this.canvas.toDataURL('image/png');
    }

    renderError(msg) {
        var c = this.ctx, s = CANVAS_SIZE;
        c.clearRect(0, 0, s, s);

        c.fillStyle = '#1a0000';
        c.fillRect(0, 0, s, s);

        c.fillStyle = '#ff4444';
        c.font = 'bold 14px Arial';
        c.textAlign = 'center';
        c.fillText('Error', s / 2, 56);

        c.fillStyle = '#aaaaaa';
        c.font = '10px Arial';
        if (msg.length > 16) {
            c.fillText(msg.substring(0, 16), s / 2, 84);
            c.fillText(msg.substring(16), s / 2, 100);
        } else {
            c.fillText(msg, s / 2, 84);
        }

        return this.canvas.toDataURL('image/png');
    }

    sendImage(context, dataUrl) {
        this.send({
            event: 'setImage',
            context: context,
            payload: { image: dataUrl, target: 0 }
        });
    }
}

var plugin = new ACInfinityPlugin();

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
    plugin.init();
    plugin.connect(inPort, inPluginUUID, inRegisterEvent);
}
