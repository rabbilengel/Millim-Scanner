/*
 * KEY GRID — the clickable answer-key editor (used on the Grade scans and Results tabs).
 *
 *   Millim.keyGrid.render(container, quiz, onChange)
 * Clicking a bubble adds or removes it as a correct answer for that question.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});

  function render(container, quiz, onChange) {
    const G = M.grading;
    const layout = quiz.layout;
    container.innerHTML = '';
    container.classList.add('key-grid');
    container.classList.toggle('rtl', M.sheetLayout.CHOICE_STYLES[layout.choiceStyle].rtl);
    const labels = G.labelsFor(layout);
    quiz.answers.forEach((accepted, q) => {
      const row = document.createElement('div');
      row.className = 'key-row' + (accepted.length ? '' : ' empty');
      const num = document.createElement('span');
      num.className = 'qnum';
      num.textContent = String(q + 1);
      row.appendChild(num);
      labels.forEach((label, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bubble' + (accepted.includes(i) ? ' on' : '');
        b.textContent = label;
        b.title = 'Question ' + (q + 1) + ': ' + label;
        b.addEventListener('click', () => {
          const a = quiz.answers[q];
          quiz.answers[q] = a.includes(i) ? a.filter((x) => x !== i) : a.concat([i]).sort((x, y) => x - y);
          onChange();
        });
        row.appendChild(b);
      });
      container.appendChild(row);
    });
  }

  M.keyGrid = { render };
})(typeof window !== 'undefined' ? window : globalThis);
