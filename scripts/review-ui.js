const fs = require('fs');
const h = fs.readFileSync('C:/Users/jkhch/Desktop/fashion/index.html', 'utf8');
const issues = [];
if (h.includes('stage-title')) issues.push('stage-title still present');
if (h.includes('demo-note')) issues.push('demo-note still present');
if (h.includes('사진 업로드 →')) issues.push('top description still present');
if (!h.includes('--canvas-w: 390px')) issues.push('fixed canvas missing');
if (!h.includes('--tab-h: 76px')) issues.push('tab height missing');
if (!h.includes('screen-scroll')) issues.push('screen-scroll missing');
if (!h.includes('id="exploreScroll"')) issues.push('exploreScroll missing');
if (!h.includes('id="closetScroll"')) issues.push('closetScroll missing');
const scripts = h.split('<script>').slice(1);
const last = scripts[scripts.length - 1].split('</script>')[0];
try { new Function(last); } catch (e) { issues.push('JS: ' + e.message); }
['btnAnalyzeAI','photoPreview','uploadPlaceholder','avatarBody','exploreGrid','wishFab','cartFab'].forEach((id) => {
  if (!h.includes(`id="${id}"`)) issues.push('missing #' + id);
});
console.log(issues.length ? 'ISSUES:\n- ' + issues.join('\n- ') : 'UI REVIEW OK');
