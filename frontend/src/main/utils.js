'use strict';

function normalizeGoalTitle(title) {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[.,!?:;\-_()[\]{}'"/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  normalizeGoalTitle
};
