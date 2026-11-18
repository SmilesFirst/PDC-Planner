// Shared logins. The server only ever stores ENCRYPTED data for the secret parts:
// the browser encrypts username, password and notes with the team vault passphrase
// (AES-GCM, key from PBKDF2) before sending. The passphrase never leaves the browser.
//
// Two kinds of records live here:
//   kind "vault"      id "vault-meta": the random salt and a small check value used to verify the passphrase
//   kind "credential": site name and web address in the clear, plus the encrypted "secret"

const { createHandler, str, ID_RE } = require('./_crud');

const VAULT_ID = 'vault-meta';
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

function blob(b, what) {
  if (!b || typeof b !== 'object' || typeof b.iv !== 'string' || typeof b.ct !== 'string') throw new Error(`${what} is missing.`);
  if (!/^[A-Za-z0-9+/]{16}$/.test(b.iv)) throw new Error(`${what} is not valid.`);
  if (!B64.test(b.ct) || b.ct.length > 12000) throw new Error(`${what} is not valid or is too large.`);
  return { iv: b.iv, ct: b.ct };
}

function clean(c, by, now) {
  if (!c || typeof c !== 'object') throw new Error('Entry is missing.');
  const id = str(c.id, 40);
  if (!ID_RE.test(id)) throw new Error('Entry id is invalid.');
  const meta = { updatedAt: now, updatedBy: str(by, 60) || 'Unknown' };

  if (c.kind === 'vault') {
    if (id !== VAULT_ID) throw new Error('Vault id is invalid.');
    const salt = str(c.salt, 64);
    if (!/^[A-Za-z0-9+/]{16,64}={0,2}$/.test(salt)) throw new Error('Vault salt is not valid.');
    const iter = Math.round(Number(c.iter));
    if (!(iter >= 100000 && iter <= 3000000)) throw new Error('Vault settings are not valid.');
    return { id, kind: 'vault', site: 'Vault', url: '', salt, iter, check: blob(c.check, 'Vault check'), ...meta };
  }

  if (id === VAULT_ID) throw new Error('That id is reserved.');
  const site = str(c.site, 120);
  if (!site) throw new Error('Give the site a name.');
  const url = str(c.url, 500);
  // Web addresses only, so a saved link can never run code.
  if (url && !/^https?:\/\/\S+$/i.test(url)) throw new Error('The website must start with http:// or https://');
  return { id, kind: 'credential', site, url, secret: blob(c.secret, 'The encrypted login'), ...meta };
}

module.exports = createHandler({ name: 'credentials', listKey: 'credentials', clean, seedItems: [] });
