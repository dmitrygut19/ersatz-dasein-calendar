// User-approved +15% for button hover only. Keep upstream assets/listeners intact.
// lino-ui 0.2 has no volume option; scope the build adapter to its sound module.
export function linoSoundLevel(){return {name:'calendar-lino-sound-level',enforce:'pre',transform(code,id){
 if(!id.split('?')[0].replaceAll('\\','/').endsWith('/lino-ui/src/ds/sounds.js'))return;
 const original="const volume = sound === 'supportAccent' ? 0.24 : 0.28;";
 if(!code.includes(original))throw new Error('lino-ui sound volume adapter needs review for this package version.');
 return {code:code.replace(original,"const volume = sound === 'buttonHover' ? 0.28 * 1.15 : sound === 'supportAccent' ? 0.24 : 0.28;"),map:null};
}};}
