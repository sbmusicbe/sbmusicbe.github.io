// Gedeelde Firebase-code voor de gastpagina en het beheer.
import { firebaseConfig } from './config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, doc, collection, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, where, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

export const configured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);
export const app = configured ? initializeApp(firebaseConfig) : null;
export const db = configured ? getFirestore(app) : null;
export const auth = configured ? getAuth(app) : null;

export const eventRef = id => doc(db, 'events', id);
export const requestsCol = () => collection(db, 'requests');
export const eventsCol = () => collection(db, 'events');

export {
  doc, collection, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where,
  serverTimestamp, writeBatch, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail
};

// ---- kleine hulpjes ----
export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Zelfde nummer = zelfde sleutel, ook bij "(Remastered)", "- Radio Edit", "feat." enz.
export function songKey(title, artist) {
  const norm = s => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+(feat\.?|ft\.?|featuring)\s+.*$/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  return (norm(title) + '|' + norm(artist).split(/ (?:and|x) /)[0]).slice(0, 300);
}

// Alleen hoesjes van Apple (mzstatic) toegelaten, zie firestore.rules.
export const safeArt = u => /^https:\/\/[a-z0-9.-]+\.mzstatic\.com\//i.test(u || '') ? u : '';

// Zoeken via de iTunes Search API (JSONP: geen sleutel nodig, werkt vanaf elke site).
let jsonpN = 0;
export function searchSongs(term, {limit = 15, country = 'BE'} = {}) {
  return new Promise((resolve, reject) => {
    const cb = '__vzcb' + (++jsonpN);
    const s = document.createElement('script');
    const done = () => { delete window[cb]; s.remove(); clearTimeout(t); };
    const t = setTimeout(() => { done(); reject(new Error('timeout')); }, 8000);
    window[cb] = data => {
      done();
      resolve((data.results || []).filter(r => r.kind === 'song').map(r => ({
        title: r.trackName, artist: r.artistName, album: r.collectionName || '',
        artwork: (r.artworkUrl100 || '').replace('100x100bb', '200x200bb'),
        preview: r.previewUrl || '', year: (r.releaseDate || '').slice(0, 4)
      })));
    };
    s.onerror = () => { done(); reject(new Error('netwerk')); };
    s.src = 'https://itunes.apple.com/search?' + new URLSearchParams({
      term, entity: 'song', media: 'music', limit, country, callback: cb
    });
    document.head.appendChild(s);
  });
}

export function toast(msg, ms = 2600) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms);
}

export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
