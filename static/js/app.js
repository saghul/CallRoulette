
function initializeCallRoulette() {
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

    var mediaStream = null;
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
        ws = new WebSocket("ws://" + document.location.host + "/ws", "callroulette");
        ws.onopen = function(event) {
            console.log('Connected!');
            status = 'connected';
        };
        ws.onerror = function(event) {
            console.log('WS Error');
            stop();
        };
        ws.onmessage = processWsMessage;
    }

    function stop() {
        if (status === 'stopped') {
            return;
        }
        console.log('Stop');
        ws.close();
        ws = null;
        status = 'stopped';
        if (mediaStream !== null) {
            rtcninja.closeMediaStream(mediaStream);
            mediaStream = null;
        }
    }

    function processWsMessage(event) {
        var msg = JSON.parse(event.data);
        if (msg.type === 'test') {
            testRtc();
            var reply = {type: 'answer',
                         data: 'lolailooo'};
            ws.send(JSON.stringify(reply));
        }

    }

    function testRtc() {
        rtcninja.getUserMedia({audio: true, video: true},
                            function(stream) {
                                mediaStream = stream;
                                console.log("Local media stream acquired successfully");
                                var elem = document.querySelector('.peerVideo video.remote');
                                rtcninja.attachMediaStream(elem, mediaStream);
                            },
                            function(err) {
                                console.log("Error getting local media stream: " + err);
                            });
    }

}


(function (fn) {
    if (document.readyState != 'loading'){
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
})(initializeCallRoulette);

