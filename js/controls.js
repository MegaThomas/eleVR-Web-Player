/* global canvas, fullScreenButton, loopButton, muteButton, playL, playR, playButton, projectionSelect, quat, seekBar, webGL, video, videoSelect, vrHMD, vrSensor */

var reqAnimFrameID = 0;
var projection = 0;
var manualRotation = quat.create(),
    degtorad = Math.PI / 180;  // Degree-to-Radian conversion

(function(global) {
  'use strict';

  var videoObjectURL;

  var controls = {
    manualControls: {
      'a' : {index: 1, sign: 1, active: 0},
      'd' : {index: 1, sign: -1, active: 0},
      'w' : {index: 0, sign: 1, active: 0},
      's' : {index: 0, sign: -1, active: 0},
      'q' : {index: 2, sign: -1, active: 0},
      'e' : {index: 2, sign: 1, active: 0},
    },

    manualRotateRate: new Float32Array([0, 0, 0]),  // Vector, camera-relative

    create: function() {
      playButton.addEventListener('click', function() {
        controls.playPause();
      });

      playL.addEventListener('click', function() {
        controls.playPause();
      });

      playR.addEventListener('click', function() {
        controls.playPause();
      });

      loopButton.addEventListener('click', function() {
        controls.toggleLooping();
      });

      muteButton.addEventListener('click', function() {
        if (video.muted === false) {
          controls.mute();
        } else {
          controls.unmute();
        }
      });

      fullScreenButton.addEventListener('click', function() {
        controls.fullscreen();
      });

      recenterButton.addEventListener('click', function() {
        if (typeof vrSensor !== 'undefined') {
          vrSensor.zeroSensor(); // Untested
        }
        else {
          quat.invert(manualRotation, webGL.getPhoneVR().rotationQuat());
        }
      });

      seekBar.addEventListener('change', function() {
        // Calculate the new time
        var time1 = video.duration * (seekBar.value / 100);
        var time2 = videos.duration * (seekBar.value / 100);
        video.currentTime = time1;
        videos.currentTime = time2;
      });

      video.addEventListener('timeupdate', function() {
        // don't update if paused,
        // we get last time update after seekBar mousedown pauses
        if (!video.paused) {
          // Calculate the slider value
          var value = (100 / video.duration) * video.currentTime;
          seekBar.value = value;
        }
      });

      videos.addEventListener('timeupdate', function() {
        // don't update if paused,
        // we get last time update after seekBar mousedown pauses
        if (!videos.paused) {
          // Calculate the slider value
          var value = (100 / videos.duration) * videos.currentTime;
          seekBar.value = value;
        }
      });

      // Pause the video when the slider handle is being dragged
      var tempPause = false;
      seekBar.addEventListener('mousedown', function() {
        if (!video.paused) {
          video.pause();
          tempPause = true;
        }
        if (!videos.paused) {
          videos.pause();
          tempPause = true;
        }
      });

      seekBar.addEventListener('mouseup', function() {
        if (tempPause) {
          video.play();
        }
        if (tempPause) {
          videos.play();
        }
      });

      videoSelect.addEventListener('change', function() {
        projection = videoSelect.value[0];
        projectionSelect.value = projection;

        // Remove the hash/querystring if there were custom video parameters.
        window.history.pushState('', document.title, window.location.pathname);

        controls.loadVideo(videoSelect.value.substring(1));
        var selectedOption = videoSelect.options[videoSelect.selectedIndex];
        if ('autoplay' in selectedOption.dataset) {
          controls.play();
        }
      });


      projectionSelect.addEventListener('change', function() {
        projection = projectionSelect.value;
      });

      document.getElementById('select-local-file').addEventListener('click', function(event) {
        event.preventDefault();
        controls.selectLocalVideo();
      });
    },

    enableKeyControls: function() {
      function key(event, sign) {
        var control = controls.manualControls[String.fromCharCode(event.keyCode).toLowerCase()];
        if (!control)
          return;
        if (sign === 1 && control.active || sign === -1 && !control.active)
          return;
        control.active = (sign === 1);
        controls.manualRotateRate[control.index] += sign * control.sign;
      }

      function onkey(event) {
        switch (String.fromCharCode(event.charCode)) {
        case 'f':
          controls.fullscreen();
          break;
        case 'z':
          if (typeof vrSensor !== 'undefined') {
            vrSensor.zeroSensor();
          }
          else {
            quat.invert(manualRotation, webGL.getPhoneVR().rotationQuat());
          }
          break;
        case 'p':
          controls.playPause();
          break;
        case ' ': //spacebar
          controls.playPause();
          break;
        case 'g':
          controls.fullscreenIgnoreHMD();
          break;
        case 'l':
          controls.toggleLooping();
          break;
        }
      }

      document.addEventListener('keydown', function(event) { key(event, 1); },
              false);
      document.addEventListener('keyup', function(event) { key(event, -1); },
              false);
      window.addEventListener('keypress', onkey, true);
    },

    /**
     * Video Commands
     */
    loaded: function() {
      window.leftLoad.classList.add('hidden');
      window.rightLoad.classList.add('hidden');
      if (video.paused) {
        window.leftPlay.classList.remove('hidden');
        window.rightPlay.classList.remove('hidden');
      }
    },

    play: function() {
      if (video.ended) {
        video.currentTime = 0.1;
      }

      if (videos.ended) {
        videos.currentTime = 0.1;
      }

      window.videoSize = [2*video.videoWidth, video.videoHeight];
      tempCanvas.width = videoSize[0];
      tempCanvas.height = videoSize[1];
      video.play();
      videos.play();
      if (!video.paused) { // In case somehow hitting play button doesn't work.
        window.leftPlay.classList.add('hidden');
        window.rightPlay.classList.add('hidden');

        window.playButton.className = 'fa fa-pause icon';
        window.playButton.title = 'Pause';

        if (!reqAnimFrameID) {
          reqAnimFrameID = requestAnimationFrame(webGL.drawScene);
        }
      }
    },

    pause: function() {
      video.pause();
      videos.pause();
      window.playButton.className = 'fa fa-play icon';
      window.playButton.title = 'Play';

      window.leftPlay.classList.remove('hidden');
      window.rightPlay.classList.remove('hidden');
    },

    playPause: function() {
      if (video.paused === true) {
        controls.play();
      } else {
        controls.pause();
      }
    },

    setLooping: function(loop) {
      loop = !!loop;
      if (videos.loop !== loop) {
        controls.toggleLooping();
      }
    },

    toggleLooping: function() {
      if (video.loop === true) {
        loopButton.className = 'fa fa-refresh icon';
        loopButton.title = 'Start Looping';
        video.loop = false;
      } else {
        loopButton.className = 'fa fa-chain-broken icon';
        loopButton.title = 'Stop Looping';
        video.loop = true;
      }
      if (videos.loop === true) {
        loopButton.className = 'fa fa-refresh icon';
        loopButton.title = 'Start Looping';
        videos.loop = false;
      } else {
        loopButton.className = 'fa fa-chain-broken icon';
        loopButton.title = 'Stop Looping';
        videos.loop = true;
      }
    },

    ended: function() {
      this.pause();
      this.currentTime = 0;
      if (reqAnimFrameID) {
        cancelAnimationFrame(reqAnimFrameID);
        reqAnimFrameID = 0;
      }
    },

    mute: function() {
      if (video.muted) {
        return;
      }
      video.muted = true;
      window.muteButton.className = 'fa fa-volume-off icon';
      window.muteButton.title = 'Unmute';
    },

    unmute: function() {
      if (!videos.muted) {
        return;
      }
      videos.muted = false;
      window.muteButton.className = 'fa fa-volume-up icon';
      window.muteButton.title = 'Mute';
    },

    selectLocalVideo: function() {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'video/*';

      input.addEventListener('change', function () {
        var files = input.files;
        if (!files.length) {
          // The user didn't select anything.  Sad.
          console.log('File selection canceled');
          return;
        }

        videoObjectURL = URL.createObjectURL(files[0]);
        console.log('Loading local file ', files[0].name, ' at URL ', videoObjectURL);
        videoSelect.value = '';
        controls.loadVideo(videoObjectURL);
      });

      input.click();
    },

    loadVideo: function(videoFile) {
      controls.pause();
      window.leftPlay.classList.add('hidden');
      window.rightPlay.classList.add('hidden');
      window.leftLoad.classList.remove('hidden');
      window.rightLoad.classList.remove('hidden');

      webGL.gl.clear(webGL.gl.COLOR_BUFFER_BIT);

      if (reqAnimFrameID) {
        cancelAnimationFrame(reqAnimFrameID);
        reqAnimFrameID = 0;
      }

      // Hack to fix rotation for vidcon video for vidcon
      if (videoFile === 'videos/Vidcon.webm' || videoFile === 'videos/Vidcon5.mp4') {
        manualRotation = [0.38175851106643677, -0.7102527618408203, -0.2401944249868393, 0.5404701232910156];
      } else {
        manualRotation = quat.create();
      }

      var oldObjURL = videoObjectURL;
      videoObjectURL = null;

      video.src = "car_2k_left.mp4";//videoFile;
      videos.src = "car_2k_right.mp4";

      if (videoObjectURL && videoObjectURL !== videoFile) {
        URL.removeObjectURL(oldObjURL);
      }
    },

    fullscreen: function() {
      if (canvas.mozRequestFullScreen) {
        canvas.mozRequestFullScreen({ vrDisplay: vrHMD }); // Firefox
      } else if (canvas.webkitRequestFullscreen) {
        canvas.webkitRequestFullscreen({ vrDisplay: vrHMD }); // Chrome and Safari
      } else if (canvas.requestFullScreen){
        canvas.requestFullscreen();
      }
    },

    fullscreenIgnoreHMD: function() {
      if (canvas.mozRequestFullScreen) {
        canvas.mozRequestFullScreen(); // Firefox
      } else if (canvas.webkitRequestFullscreen) {
        canvas.webkitRequestFullscreen(); // Chrome and Safari
      } else if (canvas.requestFullScreen){
        canvas.requestFullscreen();
      }
    },

    hide: function() {
      window.videoControls.classList.add('hidden');
      window.messageL.classList.add('hidden');
      window.messageR.classList.add('hidden');
    },

    show: function() {
      window.videoControls.classList.remove('hidden');
      window.messageL.classList.remove('hidden');
      window.messageR.classList.remove('hidden');
    }
  };

  global.controls = controls;

})(window);
