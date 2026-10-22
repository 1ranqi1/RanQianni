export const $ = id => document.getElementById(id);

export function putText(id, value) {
  $(id).textContent = value;
}

export function make(tag, className = "", textValue) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (textValue !== undefined) node.textContent = textValue;
  return node;
}
