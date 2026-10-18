export const $ = (selector) => document.querySelector(selector);
export const el = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
let toastTimer;
export function toast(message, error = false, permanent = false) {
  clearTimeout(toastTimer);
  const box = $('#toast');
  box.textContent = message;
  box.classList.toggle('error', error);
  box.hidden = false;
  if (!permanent)
    toastTimer = setTimeout(
      () => {
        box.hidden = true;
      },
      error ? 7000 : 4000,
    );
}
export function download(data, name, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
