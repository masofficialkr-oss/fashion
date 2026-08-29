const fs = require('fs');
const h = fs.readFileSync('C:/Users/jkhch/Desktop/fashion/index.html', 'utf8');
const issues = [];
if (!h.includes('LOOKMON')) issues.push('chibi label missing');
if (!h.includes('chibiBob')) issues.push('bob animation missing');
if (!h.includes('homeBubble')) issues.push('speech bubble missing');
if (!h.includes('function updateHomeBubble')) issues.push('bubble fn missing');
if (!h.includes('dailyQuest')) issues.push('daily quest missing');
const last = h.split('<script>').pop().split('</script>')[0];
try { new Function(last); } catch (e) { issues.push('JS: ' + e.message); }
console.log(issues.length ? issues.join('; ') : 'OK');
