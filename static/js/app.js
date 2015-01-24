
function createLocalDescription(type, connection, constraints, onSuccess, onFailure) {
    console.log('creating ' + type);
    if (type === 'offer') {
        connection.createOffer(
            // success
            createSucceeded,
            // failure
            function(error) {
                onFailure(error);
            },
            // constraints
            constraints
        );
    } else if (type === 'answer') {
        connection.createAnswer(
            // success
            createSucceeded,
            // failure
            function(error) {
                onFailure(error);
            },
            // constraints
            constraints
        );
    } else {
        throw new Error('createLocalDescription() | type must be "offer" or "answer", but "' +type+ '" was given');
    }

    // createAnswer or createOffer succeeded
    function createSucceeded(desc) {
        connection.onicecandidate = function(event, candidate) {
            if (!candidate) {
                connection.onicecandidate = null;
                onSuccess(connection.localDescription.sdp);
                onSuccess = null;
            }
        };
        connection.setLocalDescription(
            desc,
            // success
            function() {
                if (connection.iceGatheringState === 'complete') {
                    if (onSuccess) {
                        onSuccess(connection.localDescription.sdp);
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

    // TODO: create a Callroulette class

    var localStream = null;
    var remoteStream = null;
    var ws = null;
    var connection = null;
    var status = 'stopped';
    var startStopButton = document.querySelector('#startStopButton');

    startStopButton.classList.add('enabled');
    startStopButton.addEventListener('click', onStartStopButtonClick, false);

    function onStartStopButtonClick() {
        console.log('Status: ' + status);
        if (status === 'stopped') {
            start();
        } else if (status === 'connected') {
            stop();
        }
    }

    function start() {
        console.log('Start');
        status = 'connecting';

        rtcninja.getUserMedia({audio: true, video: true},
            // success
            function(stream) {
                localStream = stream;
                console.log("Local media stream acquired successfully");
                var elem = document.querySelector('.peerVideo video.local');
                rtcninja.attachMediaStream(elem, stream);
                ws = new WebSocket("ws://" + document.location.host + "/ws", "callroulette");
                ws.onmessage = processWsMessage;
                ws.onopen = function(event) {
                    console.log('Connected!');
                    status = 'connected';
                };
                ws.onerror = function(event) {
                    console.log('WS Error');
                    stop();
                };
                ws.onclose = function(event) {
                    console.log('WS closed!');
                    stop();
                }
            },
            // error
            function(error) {
                console.log("Error getting local media stream: " + error);
                stop();
            });
    }

    function stop() {
        if (status === 'stopped') {
            return;
        }
        console.log('Stop');
        status = 'stopped';
        if (ws !== null) {
            ws.close();
            ws = null;
        }
        if (localStream !== null) {
            rtcninja.closeMediaStream(localStream);
            localStream = null;
        }
        if (remoteStream !== null) {
            rtcninja.closeMediaStream(remoteStream);
            remoteStream = null;
        }
        if (connection !== null) {
            connection.close();
            connection = null;
        }
    }

    function processWsMessage(event) {
        var msg = JSON.parse(event.data);
        if (msg.type === 'offer_request') {
            initWithOfferRequest(
                // success
                function(sdp, stream) {
                    var reply = {type: 'offer', sdp: sdp};
                    ws.send(JSON.stringify(reply));
                },
                // failure
                function(error) {
                    stop();
                }
            );
        } else if (msg.type == 'offer') {
            initWithOffer(
                msg.sdp,
                // success
                function(sdp, stream) {
                    var reply = {type: 'answer', sdp: sdp};
                    ws.send(JSON.stringify(reply));
                },
                // failure
                function(error) {
                    stop();
                }
            );
        } else if (msg.type == 'answer') {
            var answer = {type: 'answer', sdp: msg.sdp};
            connection.setRemoteDescription(
                new rtcninja.RTCSessionDescription(answer),
                // success
                function() {
                },
                // failure
                function(error) {
                    stop();
                }
            );
        } else {
            console.log('Invalid message type: ' + msg.type);
            stop();
        }
    }

    function initConnection() {
        var pcConfig = {iceServers: []};
        var rtcConstraints = null;
        return new rtcninja.Connection(pcConfig, rtcConstraints);
    }

    function initWithOfferRequest(onSuccess, onFailure) {
        if (connection !== null) {
            throw new Error('Connection is already set')
        }

        connection = initConnection();
        connection.onaddstream = onAddStream;
        connection.addStream(localStream);

        createLocalDescription(
            'offer',
            connection,
            // constraints
            null,
            // onSuccess
            function(sdp) {
                onSuccess(sdp);
            },
            // onFailure
            function(error) {
                console.log('Error getting SDP: ' + error);
                onFailure(error);
            }
        );
    }

    function initWithOffer(sdp, onSuccess, onFailure) {
        if (connection !== null) {
            throw new Error('Connection is already set')
        }

        connection = initConnection();
        connection.onaddstream = onAddStream;
        connection.addStream(localStream);

        var offer = {type: 'offer', sdp: sdp};
        connection.setRemoteDescription(
            new rtcninja.RTCSessionDescription(offer),
            // success
            function() {
                createLocalDescription(
                    'answer',
                    connection,
                    // constraints
                    null,
                    // onSuccess
                    function(sdp) {
                        onSuccess(sdp);
                    },
                    // onFailure
                    function(error) {
                        console.log('Error getting SDP: ' + error);
                        onFailure(error);
                    }
                );
            },
            // failure
            function(error) {
                console.log('Error setting remote description: ' + error);
                onFailure(error);
            }
        );

    }

    function onAddStream(event, stream) {
        if (remoteStream !== null) {
            // only one stream is supported
            return;
        }
        remoteStream = stream;
        console.log('Remote stream added');
        var elem = document.querySelector('.peerVideo video.remote');
        rtcninja.attachMediaStream(elem, stream);
    }

}


(function (fn) {
    if (document.readyState != 'loading'){
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
})(runCallRoulette);

