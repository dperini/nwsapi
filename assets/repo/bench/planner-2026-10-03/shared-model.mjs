// Experimental model. The production runtime does not import this file.
export function chooseBroad(count, total, arity) {
  return ((arity === 2 || arity === 6) && total >= 131 && total <= 1155 && count >= 2 && count <= 819 && (count / total) >= 0.013605442176870748 && (count / total) <= 0.7974683544303798) ? ((count / total) <= 0.3937801496985959 ? false : true) : (count > 0 && count * 3 > total)
}
