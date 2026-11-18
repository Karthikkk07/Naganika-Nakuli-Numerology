(function () {
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  function card(v) {
    var thumb = 'https://img.youtube.com/vi/' + v.youtube_id + '/hqdefault.jpg';
    var title = v.title || (v.kind === 'short' ? 'YouTube Short' : 'YouTube video');
    return '<div class="card yt-card' + (v.kind === 'short' ? ' short' : '') + '">' +
      '<div class="yt-thumb" data-yt="' + esc(v.youtube_id) + '" data-kind="' + esc(v.kind) + '" role="button" tabindex="0" aria-label="Play ' + esc(title) + '">' +
      '<img src="' + thumb + '" alt="' + esc(title) + '" loading="lazy"><span class="yt-play">&#9654;</span></div>' +
      '<h3 style="margin:12px 0 6px;font-size:1.05rem">' + esc(title) + '</h3>' +
      '<a class="btn dark" style="padding:7px 14px;font-size:.9rem" href="contact.html">Book a consultation</a> ' +
      '<a style="font-size:.9rem" href="https://www.youtube.com/' + (v.kind === 'short' ? 'shorts/' : 'watch?v=') + esc(v.youtube_id) + '" target="_blank" rel="noopener">Watch on YouTube</a></div>';
  }

  function play(id, kind) {
    var style = kind === 'short' ? ' style="width:min(360px,90vw);height:min(640px,80vh)"' : '';
    openLightbox('<iframe' + style + ' src="https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>');
  }

  window.renderVideos = function (el, list, emptyText) {
    el.innerHTML = list.length ? list.map(card).join('') : '<p class="muted">' + (emptyText || 'Videos coming soon.') + '</p>';
    el.querySelectorAll('.yt-thumb').forEach(function (t) {
      var go = function () { play(t.dataset.yt, t.dataset.kind); };
      t.addEventListener('click', go);
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
  };
})();
