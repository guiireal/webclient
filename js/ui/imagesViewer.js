var previews = Object.create(null);
var preqs = Object.create(null);
var pfails = Object.create(null);
var slideshowid;

(function _imageViewerSlideShow(global) {
    "use strict";

    var zoom_mode;
    var origImgWidth;
    var slideshowplay;
    var origImgHeight;
    var slideshowTimer;
    var mouseIdleTimer;
    var fullScreenManager;
    var _hideCounter = false;

    function slideshowsteps() {
        var $stepsBlock = $('.viewer-overlay').find('.viewer-images-num, .viewer-button.slideshow');
        var forward = [];
        var backward = [];
        var ii = [];
        var ci;
        var filter = function(n) {
            return is_image(n) || is_video(n);
        };

        if (slideshowplay) {
            filter = function(n) {
                return is_image(n) && fileext(n.name) !== 'pdf';
            };
        }

        // Loop through available items and extract images
        for (var i = 0, m = M.v.length; i < m; i++) {
            if (filter(M.v[i])) {
                // is currently previewed item
                if (M.v[i].h === slideshowid) {
                    ci = i;
                }
                ii.push(i);
            }
        }

        var len = ii.length;
        // If there is at least 2 images
        if (len > 1) {
            var n = ii.indexOf(ci);
            switch (n) {
                // last
                case len - 1:
                    forward.push(M.v[ii[0]].h);
                    backward.push(M.v[ii[n - 1]].h);
                    break;
                // first
                case 0:
                    forward.push(M.v[ii[n + 1]].h);
                    backward.push(M.v[ii[len - 1]].h);
                    break;
                case -1:
                    break;
                default:
                    forward.push(M.v[ii[n + 1]].h);
                    backward.push(M.v[ii[n - 1]].h);
            }
            $stepsBlock.find('.first').text(n + 1);
            $stepsBlock.find('.last').text(len);
        }

        if (_hideCounter || len < 2) {
            $stepsBlock.addClass('hidden');
        }
        else {
            $stepsBlock.removeClass('hidden');
        }
        return {backward: backward, forward: forward};
    }

    function slideshow_next() {
        var valid = true;
        $.each(dl_queue || [], function(id, file) {
            if (file.id === slideshowid && file.preview) {
                valid = false;
                return false;
                /* break loop */
            }
        });
        if (!valid) {
            return;
        }
        var steps = slideshowsteps();
        if (steps.forward.length > 0) {
            mBroadcaster.sendMessage('slideshow:next', steps);
            slideshow(steps.forward[0]);
        }
    }

    function slideshow_prev() {
        var valid = true;
        $.each(dl_queue || [], function(id, file) {
            if (file.id === slideshowid && file.preview) {
                valid = false;
                return false;
                /* break loop */
            }
        });
        if (!valid) {
            return;
        }
        var steps = slideshowsteps();
        if (steps.backward.length > 0) {
            mBroadcaster.sendMessage('slideshow:prev', steps);
            slideshow(steps.backward[steps.backward.length - 1]);
        }
    }

    function slideshow_fullscreen($overlay) {
        var $button = $overlay.find('.viewer-button.fs');

        // Set the video container's fullscreen state
        var setFullscreenData = function(state) {
            if (state) {
                $button.find('i').removeClass('fullscreen').addClass('lowscreen');
            }
            else {
                $button.find('i').removeClass('lowscreen').addClass('fullscreen');
            }
        };

        fullScreenManager = FullScreenManager($button, $overlay).change(setFullscreenData);
    }

    function slideshow_favourite(n, $overlay) {
        var $favButton = $overlay.find('.viewer-button.favourite');

        if (!n || !n.p || folderlink) {
            $favButton.addClass('hidden');
        }
        else {
            $favButton.removeClass('hidden');

            $favButton.rebind('click', function() {
                var newFavState = Number(!M.isFavourite(n.h));

                M.favourite(n.h, newFavState);

                if (newFavState) {
                    $(this).find('i').removeClass('heart').addClass('red-heart');
                }
                else {
                    $(this).find('i').removeClass('red-heart').addClass('heart');
                }
            });

            // Change favourite icon
            if (n.fav) {
                $overlay.find('.viewer-button.favourite i')
                    .removeClass('heart').addClass('red-heart');
            }
            else {
                $overlay.find('.viewer-button.favourite i')
                    .removeClass('red-heart').addClass('heart');
            }
        }
    }

    function slideshow_node(id, $overlay) {
        var n = M.getNodeByHandle(id);

        if (!n) {
            if (typeof id === 'object') {
                n = new MegaNode(id);
            }
            else if (typeof dl_node !== 'undefined' && dl_node.h === id) {
                n = dl_node;
            }
        }

        if ($overlay) {
            if (!n || !n.p || M.getNodeRoot(id) === 'shares' || folderlink) {
                $overlay.find('.viewer-button.getlink').addClass('hidden');
            }
            else {
                $overlay.find('.viewer-button.getlink')
                    .removeClass('hidden')
                    .rebind('click', function() {
                        $(document).fullScreen(false);

                        if (u_type === 0) {
                            ephemeralDialog(l[1005]);
                        }
                        else {
                            mega.Share.initCopyrightsDialog([slideshowid]);
                        }

                        return false;
                    });
            }
        }

        return n || false;
    }

    // Inits Image viewer bottom control bar
    function slideshow_imgControls(slideshow_stop) {
        var $overlay = $('.viewer-overlay');
        var $controls = $overlay.find('.viewer-slideshow-controls');
        var $startButton = $overlay.find('.viewer-button.slideshow');
        var $pauseButton = $overlay.find('.viewer-big-button.pause');
        var $prevButton = $overlay.find('.viewer-big-button.prev');
        var $nextButton = $overlay.find('.viewer-big-button.next');
        var $zoomInButton = $overlay.find('.viewer-button.plus');
        var $zoomOutButton = $overlay.find('.viewer-button.minus');
        var $percLabel = $overlay.find('.viewer-button-label.zoom');

        if (slideshow_stop) {
            $overlay.removeClass('slideshow').unbind('mousewheel.imgzoom');
            slideshowplay = false;
            $pauseButton.attr('data-state', 'pause');
            $pauseButton.find('i').removeClass('play').addClass('pause');
            clearInterval(slideshowTimer);
        }

        var resetTimer = function() {
            clearInterval(slideshowTimer);
            slideshowTimer = setInterval(slideshow_next, 4000);
        };

        // Bind Slideshow Mode button
        $startButton.rebind('click', function() {
            $overlay.addClass('slideshow');
            slideshowplay = true;
            resetTimer();
            return false;
        });

        // Bind Slideshow Pause button
        $pauseButton.rebind('click', function() {
            var $this = $(this);

            clearInterval(slideshowTimer);
            if ($(this).attr('data-state') === 'pause') {
                $this.attr('data-state', 'play');
                $this.find('i').removeClass('pause').addClass('play');
            }
            else {
                $this.attr('data-state', 'pause');
                $this.find('i').removeClass('play').addClass('pause');
                slideshowTimer = setInterval(slideshow_next, 4000);
            }
            return false;
        });

        // Bind Slideshow Prev button
        $prevButton.rebind('click', function() {
            slideshow_prev();
            resetTimer();
            return false;
        });

        // Bind Slideshow Next button
        $nextButton.rebind('click', function() {
            slideshow_next();
            resetTimer();
            return false;
        });

        // Bind ZoomIn button
        $zoomInButton.rebind('click', function() {
            slideshow_zoom($overlay);
            return false;
        });

        // Bind ZoomOut button
        $zoomOutButton.rebind('click', function() {
            slideshow_zoom($overlay, 1);
            return false;
        });

        // Clicking the percent value will reset the view to 100%
        $percLabel.rebind('click', function() {
            $percLabel.attr('data-perc', 90);
            $zoomInButton.trigger('click');
            return false;
        });

        // Allow mouse wheel to zoom in/out
        $overlay.rebind('mousewheel.imgzoom', function(e) {
            var delta = Math.max(-1, Math.min(1, (e.wheelDelta || e.deltaY || -e.detail)));

            if (delta > 0) {
                $zoomInButton.trigger('click');
            }
            else {
                $zoomOutButton.trigger('click');
            }
            return false;
        });

        // Bind Slideshow Close button
        $controls.find('.viewer-big-button.close').rebind('click', function() {
            slideshow_imgControls(1);
            return false;
        });
    }

    // Inits Pick and pan mode if image doesn't fit into the container
    function slideshow_pickpan($overlay, close) {
        var $imgWrap = $overlay.find('.img-wrap');
        var $img = $imgWrap.find('img.active');
        var wrapWidth = $imgWrap.outerWidth();
        var wrapHeight = $imgWrap.outerHeight();
        var imgWidth = $img.width();
        var imgHeight = $img.height();
        var dragStart = 0;
        var lastPos = {x: null, y: null};

        if (close) {
            $imgWrap.unbind('mousedown.pickpan');
            $imgWrap.unbind('mouseup.pickpan, mouseout.pickpan');
            $imgWrap.unbind('mousemove.pickpan');
            return false;
        }

        // Get cursor last position before dragging
        $imgWrap.rebind('mousedown.pickpan', function(event) {
            dragStart = 1;
            lastPos = {x: event.pageX, y: event.pageY};
            $(this).addClass('picked');
            return false;
        });

        // Stop dragging
        $imgWrap.rebind('mouseup.pickpan, mouseout.pickpan', function() {
            dragStart = 0;
            $(this).removeClass('picked');
            return false;
        });

        // Drag image if it doesn't fit into the container
        $imgWrap.rebind('mousemove.pickpan', function(event) {
            if (dragStart) {
                var currentPos = {x: event.pageX, y: event.pageY};
                var changeX = currentPos.x - lastPos.x;
                var changeY = currentPos.y - lastPos.y;

                /* Save mouse position */
                lastPos = currentPos;

                var imgTop = $img.position().top;
                var imgLeft = $img.position().left;
                var imgTopNew = imgTop + changeY;
                var imgLeftNew = imgLeft + changeX;

                // Check if top and left do not fall outside the image
                if (wrapHeight >= imgHeight) {
                    imgTopNew = (wrapHeight - imgHeight) / 2;
                }
                else if (imgTopNew > 0) {
                    imgTopNew = 0;
                }
                else if (imgTopNew < (wrapHeight - imgHeight)) {
                    imgTopNew = wrapHeight - imgHeight;
                }
                if (wrapWidth >= imgWidth) {
                    imgLeftNew = (wrapWidth - imgWidth) / 2;
                }
                else if (imgLeftNew > 0) {
                    imgLeftNew = 0;
                }
                else if (imgLeftNew < (wrapWidth - imgWidth)) {
                    imgLeftNew = wrapWidth - imgWidth;
                }

                $img.css({
                    'left': imgLeftNew + 'px',
                    'top': imgTopNew + 'px'
                });

                return false;
            }
        });
    }

    // Zoom In/Out function
    function slideshow_zoom($overlay, zoomout) {
        var $img = $overlay.find('img.active');
        var $percLabel = $overlay.find('.viewer-button-label.zoom');
        var perc = Math.round(parseInt($percLabel.attr('data-perc')) / 10) * 10;
        var newPerc = (perc + 10) / 100;
        var newImgWidth;
        var newImgHeight;

        if (zoomout) {
            newPerc = (perc - 10 > 0) ?  (perc - 10) / 100 : 0;
        }

        newImgWidth = origImgWidth * newPerc;
        newImgHeight = origImgHeight * newPerc;

        $img.css({
            'width': newImgWidth,
            'height': newImgHeight
        });

        zoom_mode = true;
        $overlay.addClass('zoomed');

        // Set zoom, position values and init pick and pan
        slideshow_imgPosition($overlay);
    }

    // Sets zoom percents and image position
    function slideshow_imgPosition($overlay) {
        var $img = $overlay.find('img.active');
        var $percLabel = $overlay.find('.viewer-button-label.zoom');
        var viewerWidth = $overlay.width();
        var viewerHeight = $overlay.height();
        var imgWidth = $img.width();
        var imgHeight = $img.height();
        var perc = 0;

        // Set current img size percents
        if (origImgWidth) {
            perc = Math.round(imgWidth / origImgWidth * 100);
            $percLabel.attr('data-perc', perc).text(perc + '%');
        }

        // Quit if zoom mode is off
        if (!zoom_mode) {
            return false;
        }

        // Init pick and pan mode if Image larger its wrapper
        if (imgWidth > viewerWidth || imgHeight > viewerHeight) {
            slideshow_pickpan($overlay);
        }
        else {
            slideshow_pickpan($overlay, 1);
        }

        // Set zoomed image position
        $img.css({
            'left': (viewerWidth - imgWidth) / 2,
            'top': (viewerHeight - imgHeight) / 2
        });
    }

    // Viewer Init
    function slideshow(id, close, hideCounter) {
        var $overlay = $('.viewer-overlay');
        var $controls = $overlay.find('.viewer-top-bl, .viewer-bottom-bl, .viewer-slideshow-controls');
        var $document = $(document);

        $overlay.removeClass('fullscreen mouse-idle');

        if (d) {
            console.log('slideshow', id, close, slideshowid);
        }

        if (close) {
            zoom_mode = false;
            slideshowid = false;
            _hideCounter = false;
            slideshowplay = false;
            $overlay.removeClass('video video-theatre-mode mouse-idle slideshow zoomed').addClass('hidden');
            $overlay.find('.viewer-button-label.zoom').attr('data-perc', 100);
            $(window).unbind('resize.imgResize');
            $document.unbind('keydown.slideshow mousemove.idle');
            $overlay.find('.viewer-image-bl .img-wrap').attr('data-count', '');
            $overlay.find('.viewer-image-bl img').attr('src', '').removeAttr('style');
            if (fullScreenManager) {
                fullScreenManager.destroy();
                fullScreenManager = null;
            }
            for (var i in dl_queue) {
                if (dl_queue[i] && dl_queue[i].id === id) {
                    if (dl_queue[i].preview) {
                        dlmanager.abort(dl_queue[i]);
                    }
                    break;
                }
            }
            mBroadcaster.sendMessage('slideshow:close');
            slideshow_freemem();
            return false;
        }

        var n = slideshow_node(id, $overlay);
        if (!n) {
            return;
        }

        // Checking if this the first preview (not a preview navigation)
        if (!slideshowid) {
            // then pushing fake states of history/hash
            if (!hashLogic && !location.hash) {
                var isSearch = page.indexOf('fm/search/');
                if (isSearch >= 0) {
                    var searchString = page.substring(isSearch + 10);
                    var tempPage = page.substring(0, isSearch + 10);
                    history.pushState({subpage: tempPage, searchString: searchString}, "", "/" + tempPage);
                }
                else {
                    history.pushState({subpage: page}, '', '/' + page);
                }
            }

            _hideCounter = hideCounter;
        }

        slideshowid = n.h;
        if (window.selectionManager) {
            selectionManager.clear_selection();
            selectionManager.set_currently_selected(n.h);
        }
        else {
            $.selected = [n.h];
        }

        // Turn off pick and pan mode
        slideshow_pickpan($overlay, 1);

        // Bind static events is viewer is not in slideshow mode to avoid unnecessary rebinds
        if (!slideshowplay) {
            $overlay.removeClass('fullscreen mouse-idle slideshow');

            // Bind keydown events
            $document.rebind('keydown.slideshow', function(e) {
                if (e.keyCode === 37 && slideshowid && !e.altKey && !e.ctrlKey) {
                    slideshow_prev();
                }
                else if (e.keyCode === 39 && slideshowid) {
                    slideshow_next();
                }
                else if (e.keyCode === 27 && slideshowid && !$document.fullScreen()) {
                    if ($.dialog) {
                        closeDialog($.dialog);
                    }
                    else if (slideshowplay) {
                        slideshow_imgControls(1);
                    }
                    else {
                        slideshow(0, 1);
                    }
                }
                else if (e.keyCode === 8 || e.key === 'Backspace') {
                    // since Backspace event is processed with keydown at document level for cloudBrowser.
                    // i prefered that to process it here, instead of unbind the previous handler.
                    if (hashLogic || location.hash) {
                        slideshow(0, 1);
                    }
                    else {
                        history.back();
                    }
                    return false;
                }
            });

            // Close icon
            $overlay.find('.viewer-button.close,.viewer-error-close')
                .rebind('click', function () {
                    if (hashLogic || location.hash) {
                        slideshow(0, 1);
                    }
                    else {
                        history.back();
                    }
                    return false;
                });

            // Properties icon
            $overlay.find('.viewer-button.info').rebind('click', function() {
                $document.fullScreen(false);
                propertiesDialog();
                return false;
            });

            clearTimeout(mouseIdleTimer);
            $document.unbind('mousemove.idle');
            $controls.unbind('mousemove.idle');

            // Slideshow Mode Init
            if (filemime(n).startsWith('image')) {
                slideshow_imgControls();

                // Autohide controls
                (function _() {
                    clearTimeout(mouseIdleTimer);
                    $overlay.removeClass('mouse-idle');
                    mouseIdleTimer = setTimeout(function() {
                        $overlay.addClass('mouse-idle');
                    }, 4000);
                    $document.rebind('mousemove.idle', _);
                })();
                $controls.rebind('mousemove.idle', function() {
                    onIdle(function() {
                        clearTimeout(mouseIdleTimer);
                    });
                });

                if (!fullScreenManager) {
                    slideshow_fullscreen($overlay);
                }
            }
        }

        // Favourite Icon
        slideshow_favourite(n, $overlay);

        // Set file data
        zoom_mode = false;
        $overlay.find('.viewer-filename').text(n.name);
        $overlay.find('.viewer-pending').removeClass('hidden');
        $overlay.find('.viewer-progress').addClass('hidden');
        $overlay.find('.viewer-progress, .viewer-error, video').addClass('hidden');
        $overlay.find('.viewer-mid-button.prev,.viewer-mid-button.next').removeClass('active');
        $overlay.find('.viewer-progress p').removeAttr('style');

        var steps = slideshowsteps();
        if (steps.backward.length > 0) {
            $overlay.find('.viewer-mid-button.prev').addClass('active');
        }
        if (steps.forward.length > 0) {
            $overlay.find('.viewer-mid-button.next').addClass('active');
        }

        $overlay.find('.viewer-mid-button.prev, .viewer-mid-button.next').rebind('click', function() {
            var c = $(this).attr('class');
            if (c && c.indexOf('active') > -1) {
                var steps = slideshowsteps();
                if (c.indexOf('prev') > -1 && steps.backward.length > 0) {
                    slideshow_prev();
                }
                else if (c.indexOf('next') > -1 && steps.forward.length > 0) {
                    slideshow_next();
                }
            }

            return false;
        });

        var $dlBut = $overlay.find('.viewer-button.download');
        $dlBut.rebind('click', function() {
            var n = M.d[slideshowid];
            var p = previews[n && n.h];

            if (p && p.full) {
                M.saveAs(p.buffer, n.name);
                return false;
            }

            for (var i = dl_queue.length; i--;) {
                if (dl_queue[i] && dl_queue[i].id === slideshowid && dl_queue[i].preview) {
                    dl_queue[i].preview = false;
                    M.openTransfersPanel();
                    return;
                }
            }

            // TODO: adapt the above code to work on the downloads page if we need to download the original
            if (page === 'download') {
                $('.big-button.download-file').click();
            }
            else if (M.d[slideshowid]) {
                M.addDownload([slideshowid]);
            }
            else {
                M.addDownload([n]);
            }

            return false;
        });

        if (n.p || M.chat || page === 'download') {
            $dlBut.removeClass('hidden');
        }
        else {
            $dlBut.addClass('hidden');
        }

        if (previews[n.h] && preqs[n.h]) {
            previewsrc(n.h);
            fetchnext();
        }
        else if (!preqs[n.h]) {
            fetchsrc(n);
        }

        $overlay.removeClass('hidden');
    }

    function fetchnext() {
        var n = M.d[slideshowsteps().forward[0]];
        if (!n || !n.fa) {
            return;
        }
        if (n.fa.indexOf(':1*') > -1 && !preqs[n.h] && !previews[n.h]) {
            fetchsrc(n.h);
        }
    }

    function fetchsrc(id) {
        function eot(id, err) {
            delete preqs[id];
            delete pfails[id];
            M.addDownload([id], false, err ? -1 : true);
        }

        eot.timeout = 8500;

        var preview = function preview(ctx, h, u8) {
            previewimg(h, u8, ctx.type);

            if (isThumbnailMissing(n)) {
                createNodeThumbnail(n, u8);
            }
            if (h === slideshowid) {
                fetchnext();
            }
        };

        var n = slideshow_node(id);
        if (!n) {
            console.error('Node "%s" not found...', id);
            return false;
        }

        if (filetype(n) === 'PDF Document') {
            if (!preqs[n.h]) {
                preqs[n.h] = 1;

                M.gfsfetch(n.link || n.h, 0, -1).done(function(data) {
                    preview({type: 'application/pdf'}, n.h, data.buffer);
                }).fail(function(ev) {
                    if (d) {
                        console.warn('Failed to retrieve PDF, failing back to broken eye image...', ev);
                    }

                    var svg = decodeURIComponent(noThumbURI.substr(noThumbURI.indexOf(',') + 1));
                    var u8 = new Uint8Array(svg.length);
                    for (var i = svg.length; i--;) {
                        u8[i] = svg.charCodeAt(i);
                    }
                    previewimg(n.h, u8, 'image/svg+xml');
                    delete previews[n.h].buffer;
                    preqs[n.h] = 0; // to retry again
                    if (ev && ev.target && ev.target.status === 509) {
                        dlmanager.setUserFlags();
                        dlmanager.showOverQuotaDialog();
                    }
                    else if (ev === EOVERQUOTA) {
                        dlmanager.setUserFlags();
                        dlmanager.showOverQuotaDialog();
                    }
                });
            }
            return false;
        }

        if (is_video(n)) {
            if (!preqs[n.h]) {
                preqs[n.h] = 1;

                M.require('videostream').done(function() {
                    if (preqs[n.h]) {
                        previewimg(n.h, Array(26).join('x'), filemime(n));
                    }
                }).fail(function() {
                    console.error('Failed to load videostream.js');
                });
            }
            return false;
        }

        if (pfails[n.h]) {
            // for slideshow_next/prev
            if (slideshowid === n.h) {
                return eot(n.h, 1);
            }
            delete pfails[n.h];
        }

        var treq = Object.create(null);
        preqs[n.h] = 1;
        treq[n.h] = {fa: n.fa, k: n.k};
        var getPreview = api_getfileattr.bind(window, treq, 1, preview, eot);

        if (n.s > 0x1000000 || is_image(n) !== 1) {
            getPreview();
        }
        else {
            M.gfsfetch(n.link || n.h, 0, -1).tryCatch(function(data) {
                preview({type: filemime(n, 'image/jpeg')}, n.h, data.buffer);
            }, getPreview);
        }
    }

    // start streaming a video file
    function slideshow_videostream(id, $overlay) {
        if (!$overlay || !$overlay.length) {
            $overlay = $('video:visible').parent();
        }
        var n = slideshow_node(id, $overlay);

        $('.play-video-button', $overlay).rebind('click', function() {
            if (dlmanager.isOverQuota) {
                return dlmanager.showOverQuotaDialog();
            }

            var destroy = function() {
                $overlay.find('.viewer-pending').addClass('hidden').end().trigger('video-destroy');

                if (preqs[n.h] && preqs[n.h] instanceof Streamer) {
                    mBroadcaster.removeListener(preqs[n.h].ev1);
                    mBroadcaster.removeListener(preqs[n.h].ev2);
                    mBroadcaster.removeListener(preqs[n.h].ev3);

                    preqs[n.h].destroy();
                    preqs[n.h] = false;
                }
            };

            // Show loading spinner until video is playing
            $overlay.find('.viewer-pending').removeClass('hidden');
            $overlay.addClass('video-theatre-mode')
                .find('.viewer-image-bl').removeClass('default-state');

            initVideoStream(n, $overlay, destroy).done(function(streamer) {
                preqs[n.h] = streamer;

                preqs[n.h].ev1 = mBroadcaster.addListener('slideshow:next', destroy);
                preqs[n.h].ev2 = mBroadcaster.addListener('slideshow:prev', destroy);
                preqs[n.h].ev3 = mBroadcaster.addListener('slideshow:close', destroy);

                // If video is playing
                preqs[n.h].on('playing', function() {
                    var video = this.video;

                    if (video && video.duration) {

                        if (isThumbnailMissing(n) && is_video(n) === 1 && n.u === u_handle && n.f !== u_handle) {
                            var took = Math.round(2 * video.duration / 100);

                            if (d) {
                                console.debug('Video thumbnail missing, will take image at %s...',
                                    secondsToTime(took));
                            }

                            this.on('timeupdate', function() {
                                if (video.currentTime < took) {
                                    return true;
                                }

                                this.getImage().then(createNodeThumbnail.bind(null, n))
                                    .catch(console.warn.bind(console));
                            });
                        }

                        return false;
                    }

                    return true;
                });
            }).catch(console.warn.bind(console));
        });

        $overlay.removeClass('zoomed').addClass('video');
        $overlay.find('video').removeClass('hidden');
        $overlay.find('.viewer-pending').addClass('hidden');
        // $overlay.find('.viewer-progress').addClass('hidden');
        $overlay.find('.viewer-image-bl .img-wrap').addClass('hidden');
        $overlay.find('.viewer-image-bl').removeClass('hidden');

        if (n.name) {
            var c = MediaAttribute.getCodecStrings(n);
            if (c) {
                $overlay.find('.viewer-filename').attr('title', c.join("/"));
            }
        }

        var $video = $overlay.find('.viewer-image-bl video');
        $video.attr('poster', '').attr('controls', false).removeClass('hidden');

        if (previews[id].poster !== undefined) {
            $video.attr('poster', previews[id].poster);
        }
        else if (String(n.fa).indexOf(':1*') > 0) {
            getImage(n, 1).then(function(uri) {
                previews[id].poster = uri;

                if (id === slideshowid) {
                    $video.attr('poster', uri);
                }
            }).catch(console.debug.bind(console));
        }
        else {
            $overlay.find('.viewer-image-bl').addClass('default-state');
        }
        previews[id].poster = previews[id].poster || '';

        if ($.autoplay === id || page === 'download') {
            onIdle(function() {
                $('.play-video-button', $overlay).trigger('click');
            });
            delete $.autoplay;
        }
    }

    function isThumbnailMissing(n) {
        return !n.fa || n.fa.indexOf(':0*') < 0;
    }

    function createNodeThumbnail(n, ab) {
        if (isThumbnailMissing(n)) {
            if (d) {
                console.log('Thumbnail found missing on preview, creating...', n.h, n);
            }
            var aes = new sjcl.cipher.aes([
                n.k[0] ^ n.k[4],
                n.k[1] ^ n.k[5],
                n.k[2] ^ n.k[6],
                n.k[3] ^ n.k[7]
            ]);
            var img = is_image(n);
            var vid = is_video(n);
            createnodethumbnail(n.h, aes, n.h, ab, {raw: img !== 1 && img, isVideo: vid});
        }
    }

    // a method to fetch scripts and files needed to run pdfviewer
    // and then excute them on iframe element [#pdfpreviewdiv1]
    function prepareAndViewPdfViewer() {
        M.require('pdfjs2', 'pdfviewer', 'pdfviewercss', 'pdforiginalviewerjs').done(function() {
            var myPage = pages['pdfviewer'];
            myPage = myPage.replace('^$#^1', window['pdfviewercss']);
            myPage = myPage.replace('^$#^3', window['pdfjs2']);
            myPage = myPage.replace('^$#^4', window['pdforiginalviewerjs']);
            // remove then re-add iframe to avoid History changes [push]
            var pdfIframe = document.getElementById('pdfpreviewdiv1');
            var newPdfIframe = document.createElement('iframe');
            newPdfIframe.id = 'pdfpreviewdiv1';
            newPdfIframe.src = 'about:blank';
            var pdfIframeParent = pdfIframe.parentNode;
            pdfIframeParent.replaceChild(newPdfIframe, pdfIframe);
            var doc = newPdfIframe.contentWindow.document;
            doc.open();
            doc.write(myPage);
            doc.close();
        });
    }

    function previewsrc(id) {
        var $overlay = $('.viewer-overlay');
        var $imgBlock = $overlay.find('.viewer-image-bl');
        var $imgCount = $imgBlock.find('.img-wrap');
        // Choose img to set src for Slideshow transition effect
        var imgClass = $imgCount.attr('data-count') !== 'img1' ? 'img1' : 'img2';

        var src = Object(previews[id]).src;
        if (!src) {
            console.error('Cannot preview %s', id);
            return;
        }

        $overlay.removeClass('video video-theatre-mode');
        $imgBlock.find('embed').addClass('hidden');
        $imgBlock.find('video').addClass('hidden');
        $imgBlock.find('.img-wrap').removeClass('hidden');
        $imgBlock.find('#pdfpreviewdiv1').addClass('hidden');

        if (previews[id].type === 'application/pdf') {
            $overlay.find('.viewer-pending').addClass('hidden');
            $overlay.find('.viewer-progress').addClass('hidden');
            $imgBlock.find('.img-wrap').addClass('hidden');
            // preview pdfs using pdfjs for all browsers #8036
            // to fix pdf compatibility - Bug #7796
            localStorage.setItem('currPdfPrev2', JSON.stringify(src));
            localStorage.setItem('pdfPrevTitle', $overlay.find('.viewer-filename').text());
            prepareAndViewPdfViewer();
            api_req({a: 'log', e: 99660, m: 'Previewed PDF Document.'});
            return;
        }

        if (/^(?:audio|video)\//i.test(previews[id].type)) {
            return slideshow_videostream(id, $overlay);
        }

        var img = new Image();
        img.onload = img.onerror = function(ev) {
            origImgWidth = img.width;
            origImgHeight = img.height;

            // Apply img data to necessary image
            $imgCount.find('img').removeClass('active').removeAttr('style');
            $imgCount.find('.' + imgClass).attr('src', ev.type === 'error' ? noThumbURI : this.src)
                .addClass('active');
            $imgCount.attr('data-count', imgClass);

            // Set position, zoom values
            zoom_mode = false;
            $overlay.removeClass('zoomed');
            $overlay.find('.viewer-button-label.zoom').attr('data-perc', 100);
            slideshow_imgPosition($overlay);
            $(window).rebind('resize.imgResize', function() {
                slideshow_imgPosition($overlay);
            });

            $overlay.find('.viewer-pending').addClass('hidden');
            $overlay.find('.viewer-progress').addClass('hidden');

            if (d && ev.type === 'error') {
                console.debug('Failed to preview image...', src, ev);
            }
        };
        img.src = src;
    }

    function previewimg(id, uint8arr, type) {
        var blob;

        type = typeof type === 'string' && type || 'image/jpeg';

        try {
            blob = new Blob([uint8arr], {type: type});
        }
        catch (ex) {
        }
        if (!blob || blob.size < 25) {
            blob = new Blob([uint8arr.buffer], {type: type});
        }

        previews[id] = {
            blob: blob,
            type: type,
            time: Date.now(),
            src: myURL.createObjectURL(blob),
            buffer: uint8arr.buffer || uint8arr,
            full: Object(M.d[id]).s === blob.size
        };

        if (id === slideshowid) {
            previewsrc(id);
        }

        if (Object.keys(previews).length === 1) {
            $(window).unload(function() {
                for (var id in previews) {
                    if (previews[id].src) {
                        myURL.revokeObjectURL(previews[id].src);
                    }
                }
            });
        }

        // Ensure we are not eating too much memory...
        delay('slideshow:freemem', slideshow_freemem, 6e3);

        blob = uint8arr = undefined;
    }

    function slideshow_freemem() {
        var k;
        var size = 0;
        var now = Date.now();

        for (k in previews) {
            k = previews[k];
            size += k.buffer && k.buffer.byteLength || 0;
        }

        if (d) {
            console.debug('Previews cache is using %s of memory...', bytesToSize(size));
        }

        if (size > 0x10000000) {
            size = 0;
            for (k in previews) {
                if (k !== slideshowid) {
                    var p = previews[k];
                    if (p.buffer && (now - p.time) > 2e4) {
                        size += p.buffer.byteLength;
                        M.neuterArrayBuffer(p.buffer);
                        p.buffer = p.full = false;
                        if (p.type.startsWith('image')) {
                            URL.revokeObjectURL(p.src);
                            previews[k] = false;
                        }
                    }
                }
            }

            if (d) {
                console.debug('...freed %s', bytesToSize(size));
            }
        }
    }

    global.slideshow = slideshow;
    global.slideshow_next = slideshow_next;
    global.slideshow_prev = slideshow_prev;
    global.previewsrc = previewsrc;
    global.previewimg = previewimg;

})(self);
