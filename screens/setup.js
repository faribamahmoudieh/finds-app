// First open: ask for a fine-grained GitHub token and which device this is.
import { html } from '../html.js';
import { header } from './finds.js';

export function render(app) {
  const { S } = app;
  const checking = S.screen === 'checking';
  return html`${header(app)}
    <div class="setup">
      <h1 class="h">Set up Finds.</h1>
      <p class="sub">Finds keeps your finds and swipes in your private GitHub repo, so this device needs a token to read and write it. The token stays on this device and is never shown again.</p>
      <span class="lab pad">Make a token</span>
      <ol>
        <li>On GitHub, open Settings, then Developer settings, then Personal access tokens, then Fine-grained tokens, and choose Generate new token.</li>
        <li>Name it after this device, for example “Finds phone”, and pick an expiry date.</li>
        <li>Under Repository access, choose Only select repositories and pick faribamahmoudieh/finds. Nothing else.</li>
        <li>Under Repository permissions, set Contents to Read and write and Actions to Read and write. Metadata read-only is added for you.</li>
        <li>Generate the token, copy it and paste it below.</li>
      </ol>
      <div class="go"><a class="pill sm" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Open GitHub tokens</a></div>
      <form data-form="setup">
        <span class="lab pad">Your token</span>
        <div class="fieldwrap"><input class="field" name="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"
          placeholder="github_pat_…" data-keep="setup-token" aria-label="GitHub token"></div>
        <span class="lab pad">This device</span>
        <div class="choice">
          <button type="button" class="pill ${S.setupDevice === 'phone' ? 'on' : 'ghost'}" data-act="pickdev" data-v="phone">Phone</button>
          <button type="button" class="pill ${S.setupDevice === 'laptop' ? 'on' : 'ghost'}" data-act="pickdev" data-v="laptop">Laptop</button>
        </div>
        ${S.setupError ? html`<div class="err">${S.setupError}</div>` : ''}
        <div class="go"><button class="pill on" type="submit" ${checking ? 'disabled' : ''}>${checking ? 'Checking the token' : 'Save and start'}</button></div>
      </form>
    </div>`;
}

export const acts = {
  pickdev: (el, app) => { app.S.setupDevice = el.dataset.v; app.render(); },
};
export const forms = {
  setup: (form, app) => app.saveSetup(form.elements.token.value, app.S.setupDevice),
};
