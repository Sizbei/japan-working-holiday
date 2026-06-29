'use strict';
// N21 — Particle reference. The core Japanese particles, each with its role and an example
// sentence you can tap to hear. Collapsible on the phrasebook page. Static reference data.
import { $, esc } from './lib/dom.js';
import { mountAccordion } from './collapse.js';
import { speak, canSpeak } from './speak.js';

const SPK = canSpeak();

// [particle, romaji, role, exampleJP, exampleRead, exampleEN]
const PARTICLES = [
  ['は', 'wa', 'topic marker ("as for…")', '私は学生です', 'わたしはがくせいです · watashi wa gakusei desu', 'I am a student.'],
  ['が', 'ga', 'subject marker / "but"', '猫がいます', 'ねこがいます · neko ga imasu', 'There is a cat.'],
  ['を', 'o', 'direct object', '水を飲みます', 'みずをのみます · mizu o nomimasu', 'I drink water.'],
  ['に', 'ni', 'destination · time · location of existence', '東京に行きます', 'とうきょうにいきます · Tōkyō ni ikimasu', 'I go to Tokyo.'],
  ['で', 'de', 'place of an action · means', '駅で会います', 'えきであいます · eki de aimasu', 'I meet at the station.'],
  ['へ', 'e', 'direction (toward)', '家へ帰ります', 'いえへかえります · ie e kaerimasu', 'I head home.'],
  ['と', 'to', '"and" (full list) · "with"', '友達と行きます', 'ともだちといきます · tomodachi to ikimasu', 'I go with a friend.'],
  ['も', 'mo', '"also / too"', '私も行きます', 'わたしもいきます · watashi mo ikimasu', 'I will go too.'],
  ['の', 'no', 'possessive · "of"', '私の本', 'わたしのほん · watashi no hon', 'my book'],
  ['から', 'kara', '"from" · "because"', '駅から歩きます', 'えきからあるきます · eki kara arukimasu', 'I walk from the station.'],
  ['まで', 'made', '"until / up to"', '駅まで歩きます', 'えきまであるきます · eki made arukimasu', 'I walk to the station.'],
  ['か', 'ka', 'turns a sentence into a question', '学生ですか', 'がくせいですか · gakusei desu ka', 'Are you a student?'],
];

export function mountParticles() {
  const host = $('#particlesRef');
  if (!host) return;
  const rows = PARTICLES.map(p => {
    const spk = SPK ? `<button type="button" class="phrase-spk" data-jp="${esc(p[3])}" aria-label="Play example">🔊</button>` : '';
    return `<li class="phrase-row part-row">
      <div class="phrase-main">
        <div class="part-head"><span class="part-key jp" lang="ja">${esc(p[0])}</span><span class="part-role">${esc(p[2])}</span></div>
        <div class="part-ex"><span class="jp" lang="ja" data-word="${esc(p[3])}">${esc(p[3])}</span>
          <span class="phrase-read">${esc(p[4])}</span><span class="phrase-en">${esc(p[5])}</span></div>
      </div>${spk}
    </li>`;
  }).join('');
  host.innerHTML = `<section class="acc part-acc" data-acc="particles">
    <button type="button" class="acc-head" aria-expanded="false" aria-controls="acc-panel-particles" aria-label="Particles">
      <span class="acc-chevron" aria-hidden="true">›</span>
      <span class="acc-title">Particles (は・が・を・に…)</span>
    </button>
    <div class="acc-panel" id="acc-panel-particles" role="region" aria-label="Particles">
      <div class="acc-inner"><ul class="phrase-list">${rows}</ul></div>
    </div>
  </section>`;
  if (SPK) host.querySelectorAll('.phrase-spk').forEach(b => b.addEventListener('click', () => speak(b.dataset.jp, b)));
  mountAccordion(host);
}
