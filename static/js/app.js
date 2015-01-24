
function runCallRoulette() {
    if (!rtcninja.called) {
        rtcninja();
    }

    if (!rtcninja.hasWebRTC()) {
        console.log("WebRTC is NOT supported!");
	alertify.error('Your browser does not support WebRTC');
	return;
    }

    console.log("WebRTC is supported!");
    alertify.success('Your browser supports WebRTC');

    // CallRoulette!

    function CallRoulette(views) {
        this._views = views || {};
        this._views.local = this._views.local || null;
        this._views.remote = this._views.remote || null;

        this._localStream = null;
        this._remoteStream = null;

        this._state = 'stopped';

        this._conn = null;
        this._ws = null;
    }

    // Public API

    CallRoulette.prototype.getState = function() {
        var self = this;

        return self._state;
    }

    CallRoulette.prototype.start = function() {
        var self = this;

        console.log('Start');
        self._state = 'starting';

        rtcninja.getUserMedia({audio: true, video: true},
            // success
            function(stream) {
                self._localStream = stream;
                console.log("Local media stream acquired successfully");
                //var elem = document.querySelector('.peerVideo video.local');
                if (self._views.local !== null) {
                    rtcninja.attachMediaStream(self._views.local, stream);
                }
                self._ws = new WebSocket("ws://" + document.location.host + "/ws", "callroulette");
                self._ws.onmessage = function(event) {
                    self._processMessages(event.data);
                };
                self._ws.onopen = function(event) {
                    console.log('WS connected');
                    self._state = 'started';
                };
                self._ws.onclose = function(event) {
                    console.log('WS closedi');
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
        var self = this;

        if (self._state === 'stopped') {
            return;
        }

        console.log('Stop');
        self._state = 'stopped';

        if (self._ws !== null) {
            self._ws.close();
            self._ws = null;
        }

        if (self._localStream !== null) {
            rtcninja.closeMediaStream(self._localStream);
            self._localStream = null;
        }

        if (self._remoteStream !== null) {
            rtcninja.closeMediaStream(self._remoteStream);
            self._remoteStream = null;
        }

        if (self._conn !== null) {
            self._conn.close();
            self._conn = null;
        }
    }

    // Private API

    CallRoulette.prototype._processMessages = function(data) {
        var self = this;
        var msg = JSON.parse(data);

        if (msg.type === 'offer_request') {
            console.log('self: ' + self);
            self._initConnection();
            self._createLocalDescription(
                'offer',
                // onSuccess
                function(sdp) {
                    var reply = {type: 'offer', sdp: sdp};
                    self._ws.send(JSON.stringify(reply));
                },
                // onFailure
                function(error) {
                    console.log('Error getting local SDP: ' + error);
                    self.stop()
                }
            );
        } else if (msg.type == 'offer') {
            var offer = {type: 'offer', sdp: msg.sdp};
            self._initConnection();
            self._conn.setRemoteDescription(
                new rtcninja.RTCSessionDescription(offer),
                // success
                function() {
                    self._createLocalDescription(
                        'answer',
                        // onSuccess
                        function(sdp) {
                            var reply = {type: 'answer', sdp: sdp};
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
        } else if (msg.type == 'answer') {
            var answer = {type: 'answer', sdp: msg.sdp};

            if (self._conn === null) {
                throw new Error('Connection does not exist yet');
            }

            self._conn.setRemoteDescription(
                new rtcninja.RTCSessionDescription(answer),
                // success
                function() {
                    self._state = 'connected';
                },
                // failure
                function(error) {
                    self.stop();
                }
            );
        } else {
            console.log('Invalid message type: ' + msg.type);
        }
    }

    CallRoulette.prototype._initConnection = function() {
        var self = this;
        var pcConfig = {iceServers: []};
        var rtcConstraints = null;

        if (self._conn !== null) {
            throw new Error('Connection already exists');
        }

        if (self._localStream === null) {
            throw new Error('Local stream is not set');
        }

        self._conn = new rtcninja.Connection(pcConfig, rtcConstraints);
        self._conn.addStream(self._localStream);
        self._conn.onaddstream = function(event, stream) {
                                    if (self._remoteStream !== null) {
                                        // only one stream is supported
                                        return;
                                    }
                                    self._remoteStream = stream;
                                    console.log('Remote stream added');
                                    //var elem = document.querySelector('.peerVideo video.remote');
                                    if (self._views.remote !== null) {
                                        rtcninja.attachMediaStream(self._views.remote, stream);
                                    }
                                };

    }

    CallRoulette.prototype._createLocalDescription = function(type, onSuccess, onFailure) {
        var self = this;

        if (type === 'offer') {
            self._conn.createOffer(
                // success
                createSucceeded,
                // failure
                function(error) {
                    onFailure(error);
                },
                // constraints
                null
            );
        } else if (type === 'answer') {
            self._conn.createAnswer(
                // success
                createSucceeded,
                // failure
                function(error) {
                    onFailure(error);
                },
                // constraints
                null
            );
        } else {
            throw new Error('type must be "offer" or "answer", but "' +type+ '" was given');
        }

        // createAnswer or createOffer succeeded
        function createSucceeded(desc) {
            self._conn.onicecandidate = function(event, candidate) {
                if (!candidate) {
                    self._conn.onicecandidate = null;
                    if (onSuccess) {
                        onSuccess(self._conn.localDescription.sdp);
                        onSuccess = null;
                    }
                }
            };
            self._conn.setLocalDescription(
                desc,
                // success
                function() {
                    if (self._conn.iceGatheringState === 'complete') {
                        if (onSuccess) {
                            onSuccess(self._conn.localDescription.sdp);
                            onSuccess = null;
                        }
                    }
                },
                // failure
                function(error) {
                    if (onFailure) {
                        onFailure(error);
                    }
                }
            );
        }
    }

    var localView = document.querySelector('.peerVideo video.local');
    var remoteView = document.querySelector('.peerVideo video.remote');
    var callRoulette = new CallRoulette({local: localView, remote: remoteView});

    var startStopButton = document.querySelector('#startStopButton');
    startStopButton.classList.add('enabled');
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
    if (document.readyState != 'loading'){
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
})(runCallRoulette);

