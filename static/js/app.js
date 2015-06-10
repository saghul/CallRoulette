
function runCallRoulette() {
    if (!rtcninja.hasWebRTC()) {
        console.log("WebRTC is NOT supported!");
        alertify.error('Your browser does not support WebRTC');
        return;
    }

    console.log("WebRTC is supported!");
    alertify.success('Your browser supports WebRTC');

    // CallRoulette!

    function CallRoulette (view) {
        if (!view) {
            throw Error('invalid view element!');
        }

        this._view = view;         // video DOM element

        this._localStream = null;
        this._remoteStream = null;

        this._state = 'stopped';

        this._conn = null;         // RTCPeerConnection
        this._ws = null;           // WebSocket
    }

    // Public API

    CallRoulette.prototype.getState = function() {
        return this._state;
    }

    CallRoulette.prototype.start = function() {
        var self = this;

        console.log('Start');
        self._setState('starting');

        rtcninja.getUserMedia({audio: true, video: true},
            // success
            function(stream) {
                self._localStream = stream;
                console.log("Local media stream acquired successfully");
                rtcninja.attachMediaStream(self._view, stream);
                self._ws = new WebSocket("ws://" + document.location.host + "/ws", "callroulette-v2");

                self._ws.onopen = function (event) {
                    console.log('WS connected');
                    self._setState('started');
                };

                self._ws.onmessage = function (event) {
                    self._processMessages(event.data);
                };

                self._ws.onclose = function (event) {
                    console.log('WS closed');
                    self.stop();
                }
            },
            // error
            function(error) {
                alertify.error("Error getting local media stream: " + error);
                self.stop();
            });
    }

    CallRoulette.prototype.stop = function() {
        if (this._state !== 'stopped') {
            console.log('Stop');
            this._setState('stopped');

            if (this._ws !== null) {
                this._ws.close();
                this._ws = null;
            }

            if (this._localStream !== null) {
                rtcninja.closeMediaStream(this._localStream);
                this._localStream = null;
            }

            if (this._remoteStream !== null) {
                rtcninja.closeMediaStream(this._remoteStream);
                this._remoteStream = null;
            }

            if (this._conn !== null) {
                this._conn.close();
                this._conn = null;
            }
        }
    }

    // Private API

    CallRoulette.prototype._setState = function(state) {
        var prevState = this._state;
        console.log(prevState);
        console.log(state);

        if (prevState === state) {
            return;
        }

        this._state = state;
        window.setTimeout(this.onStateChanged.bind(this), 0, prevState);
    }

    CallRoulette.prototype._processMessages = function(data) {
        var self = this;
        var msg = JSON.parse(data);

        if (msg.yo !== 'yo') {
            console.log('Invalid message: ' + data);
            self.stop();
            return;
        }

        if (!msg.jsep && !msg.candidate) {
            console.log('Got offer request');
            self._initConnection();
            self._createLocalDescription(
                'offer',
                // onSuccess
                function(sdp) {
                    var reply = {yo: 'yo', jsep: {type: 'offer', sdp: sdp}};
                    self._ws.send(JSON.stringify(reply));
                },
                // onFailure
                function(error) {
                    console.log('Error getting local SDP: ' + error);
                    self.stop()
                }
            );
        } else if (msg.jsep && msg.jsep.type === 'offer') {
            console.log('Got offer');
            self._initConnection();
            self._conn.setRemoteDescription(
                new rtcninja.RTCSessionDescription(msg.jsep),
                // success
                function() {
                    self._createLocalDescription(
                        'answer',
                        // onSuccess
                        function(sdp) {
                            var reply = {yo: 'yo', jsep: {type: 'answer', sdp: sdp}};
                            self._ws.send(JSON.stringify(reply));
                        },
                        // onFailure
                        function(error) {
                            console.log('Error getting local SDP: ' + error);
                            self.stop()
                        }
                    );
                },
                // failure
                function(error) {
                    console.log('Error setting remote description: ' + error);
                    onFailure(error);
                }
            );
        } else if (msg.jsep && msg.jsep.type == 'answer') {
            console.log('Got answer');

            if (self._conn === null) {
                throw new Error('Connection does not exist yet');
            }

            self._conn.setRemoteDescription(
                new rtcninja.RTCSessionDescription(msg.jsep),
                // success
                function() {
                },
                // failure
                function(error) {
                    self.stop();
                }
            );
        } else if (msg.candidate) {
            console.log('Got trickled ICE candidate');

            if (self._conn === null) {
                throw new Error('Connection does not exist yet');
            }

            self._conn.addIceCandidate(new rtcninja.RTCIceCandidate(msg.candidate),
                                       // success
                                       function () {},
                                       // failure
                                       function (error) {
                                           console.log('Error adding remote ICE candidate: ' + error);
                                       });
        } else {
            console.log('Invalid message: ' + data);
        }
    }

    CallRoulette.prototype._initConnection = function() {
        var self = this;
        var pcConfig = {iceServers: [{"url": 'stun:stun.l.google.com:19302'},
                                     {"url": "stun:stun.services.mozilla.com"}]};

        if (self._conn !== null) {
            throw new Error('Connection already exists');
        }

        if (self._localStream === null) {
            throw new Error('Local stream is not set');
        }

        self._conn = new rtcninja.RTCPeerConnection(pcConfig);
        self._conn.addStream(self._localStream);

        self._conn.onaddstream = function (event, stream) {
            if (self._remoteStream !== null) {
                // only one stream is supported
                return;
            }
            self._remoteStream = stream;
            console.log('Remote stream added');

            rtcninja.attachMediaStream(self._view, stream);
            self._setState('established');
        };

        self._conn.onicecandidate = function (event, candidate) {
            if (candidate) {
                var message = {yo: 'yo', candidate: candidate};
                self._ws.send(JSON.stringify(message));
            }
        };
    }

    CallRoulette.prototype._createLocalDescription = function (type, onSuccess, onFailure) {
        // createAnswer or createOffer succeeded
        var fn = function createSucceeded (desc) {
            this._conn.setLocalDescription(
                desc,
                // success
                (function() {
                    if (onSuccess) {
                        onSuccess(this._conn.localDescription.sdp);
                    }
                }).bind(this),
                // failure
                function(error) {
                    if (onFailure) {
                        onFailure(error);
                    }
                }
            );
        };

        switch (type) {
        case 'offer':
            this._conn.createOffer(
                // success
                fn.bind(this),
                // failure
                function(error) {
                    onFailure(error);
                },
                // constraints
                null
            );
            break;
        case 'answer':
            this._conn.createAnswer(
                // success
                fn.bind(this),
                // failure
                function(error) {
                    onFailure(error);
                },
                // constraints
                null
            );
            break;
        default:
            throw new Error('type must be "offer" or "answer", but "' +type+ '" was given');
        }

    }

    CallRoulette.prototype.onStateChanged = function (prevState) {
        console.log('State changed: ' + prevState + ' -> ' + this._state);

        if (this._state === 'stopped') {
            startStopButton.textContent = 'Start';
        } else {
            startStopButton.textContent = 'Stop';
        }
        switch (this._state) {
        case 'starting':
            alertify.message('Connecting...');
            break;
        case 'started':
            alertify.message('Connected, waiting...');
            break;
        case 'established':
            alertify.message('Established');
            break;
        case 'stopped':
            alertify.message('Stopped');
            break;
        default:
            alertify.message('Unexpected state: ' + this._state);
        }
    }

    var videoView = document.querySelector('.videoView video');
    var callRoulette = new CallRoulette(videoView);

    var startStopButton = document.querySelector('#startStopButton');
    startStopButton.addEventListener('click', onStartStopButtonClick, false);

    function onStartStopButtonClick() {
        var state = callRoulette.getState();

        console.log('State: ' + state);
        if (state === 'stopped') {
            callRoulette.start();
        } else {
            callRoulette.stop();
        }
    }

}


(function (fn) {
    if (document.readyState !== 'loading'){
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
})(runCallRoulette);

