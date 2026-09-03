/**
 * Landing page — pause marquee animations when tab is hidden.
 */
(function () {
    'use strict';

    function setMotionPaused(paused) {
        document.documentElement.classList.toggle('inv-landing-motion-paused', paused);
    }

    document.addEventListener('visibilitychange', function () {
        setMotionPaused(document.hidden);
    });
}());
