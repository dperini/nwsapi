export function adaptiveChoice(anchors, processed, passed, hits, candidates, dense) {
  var fallback = passed > 0 && hits * 2 < passed;
  if (!Number.isFinite(+anchors) || anchors < 32.0 || anchors > 745.0 || !Number.isFinite(+processed) || processed < 4.0 || processed > 4.0 || !Number.isFinite(+passed) || passed < 2.0 || passed > 4.0 || !Number.isFinite(+hits) || hits < 0.0 || hits > 4.0 || !Number.isFinite(+candidates) || candidates < 0.0 || candidates > 21.0 || !Number.isFinite(+dense) || dense < 0.0 || dense > 1.0) { return fallback; }
  var h0 = Math.max(0, -1.3207017325990265 + (0.0020383244039294183) * anchors + (-0.170475572347641) * processed + (0.6288313237821512) * passed + (0.6574821371547203) * hits + (0.03971749622498241) * candidates + (-1.5414437295696808) * dense);
  var h1 = Math.max(0, 0.6460288619190924 + (-0.0017680114711132885) * anchors + (-0.017393413931131363) * processed + (0.14021322172684883) * passed + (-0.37976534546994595) * hits + (-0.07138626795293236) * candidates + (1.282161171127889) * dense);
  var logit = -0.6051931977272034 + (0.6359800100326538) * h0 + (-0.9386429786682129) * h1;
  if (!Number.isFinite(logit) || logit <= 1e-05) { return fallback; }
  return !fallback;
}
