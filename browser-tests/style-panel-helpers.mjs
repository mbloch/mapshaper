// The style panels' sections open and close from their headings, and only Text
// starts open (see makeCollapsibleSection() in src/gui/gui-panel-controls.mjs).
// A section stays as it was left for the rest of the session, so a test opens
// the ones it uses once, after the page has loaded.

// @panel: the panel's selector, e.g. '.text-style-panel'
// @section: the section's class, e.g. 'label-icon-section'
export async function openSection(page, panel, section) {
  await page.locator(panel + ' .' + section).evaluate(function(el) {
    if (el.classList.contains('collapsed')) {
      el.querySelector('.label-section-heading').click();
    }
  });
}

// Every section of every style panel, built or not yet shown
export async function openAllSections(page) {
  await page.evaluate(function() {
    document.querySelectorAll('.label-style-section.collapsed > .label-section-heading')
      .forEach(function(el) { el.click(); });
  });
}

export async function sectionIsOpen(page, panel, section) {
  return page.locator(panel + ' .' + section).evaluate(function(el) {
    return !el.classList.contains('collapsed');
  });
}

// What a section's heading says about the features being styled: 'on', 'off'
// or 'mixed'
export async function getSectionPresence(page, panel, section) {
  return page.locator(panel + ' .' + section + ' .label-section-marker').evaluate(function(el) {
    if (el.classList.contains('mixed')) return 'mixed';
    return el.classList.contains('on') ? 'on' : 'off';
  });
}

// Clicks a section's ×, which removes its style from the features being styled
export async function removeSectionStyle(page, panel, section) {
  await page.locator(panel + ' .' + section + ' .label-section-remove').click();
  await page.waitForTimeout(250);
}
