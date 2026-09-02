/**
 * Auth page sticker carousel — auto-swipe + touch drag.
 */
(function (global) {
    'use strict';

    function initAuthShowcase() {
        var carousel = document.querySelector('.inv-auth-sticker-carousel');
        if (!carousel) return;

        var track = carousel.querySelector('.inv-auth-sticker-track');
        var slides = Array.prototype.slice.call(carousel.querySelectorAll('.inv-auth-sticker-slide'));
        if (!slides.length) return;

        var index = 0;
        var timer = null;
        var touchStartX = 0;
        var touchDeltaX = 0;

        function showSlide(nextIndex) {
            index = (nextIndex + slides.length) % slides.length;
            slides.forEach(function (slide, i) {
                slide.classList.toggle('inv-auth-sticker-slide--active', i === index);
            });
        }

        function nextSlide() {
            showSlide(index + 1);
        }

        function prevSlide() {
            showSlide(index - 1);
        }

        function restartTimer() {
            if (timer) clearInterval(timer);
            timer = setInterval(nextSlide, 4500);
        }

        track.addEventListener('touchstart', function (event) {
            touchStartX = event.changedTouches[0].clientX;
            touchDeltaX = 0;
        }, { passive: true });

        track.addEventListener('touchmove', function (event) {
            touchDeltaX = event.changedTouches[0].clientX - touchStartX;
        }, { passive: true });

        track.addEventListener('touchend', function () {
            if (Math.abs(touchDeltaX) < 40) return;
            if (touchDeltaX < 0) nextSlide();
            else prevSlide();
            restartTimer();
        });

        restartTimer();
    }

    global.InventoryAuthShowcase = { init: initAuthShowcase };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuthShowcase);
    } else {
        initAuthShowcase();
    }
}(window));
