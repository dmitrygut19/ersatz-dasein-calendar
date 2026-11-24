<script setup lang="ts">
import {computed} from 'vue';
import type {PublicEvent} from '../../lib/calendar';
import MentorButton from '../ui/MentorButton.vue';
import LinoTag from '../ui/LinoTag.vue';
import LinoIcon from '../ui/LinoIcon.vue';
import {linoSurface as vLinoSurface} from '../../lib/lino-card-frame';
import tokens from '../../../design/tokens.json';
const props=defineProps<{event:PublicEvent;state:string;embedded?:boolean;calendarHref?:string;showClose?:boolean;accessLodge?:{id:string;name:string;iconUrl:string|null}}>();
const emit=defineEmits<{close:[];retry:[];manage:[];follow:[]}>();
const buttonSounds=computed(()=>({'data-sound-hover':props.embedded?'':'buttonHover','data-sound-click':props.embedded?'':'buttonClick'}));
const locked=computed(()=>!props.embedded&&(!props.event.canFollow||props.state!=='idle'));
const date=computed(()=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',weekday:'long',timeZone:props.event.timezone||'Europe/Moscow'}).format(new Date(props.event.date+'T12:00:00+03:00')).replace(/^([^,]+), (.+)$/, '$2, $1')+' в '+props.event.start);
const palette={background:tokens.color.primitive['brown-900'],text:tokens.eventTheme.saturnalia.text,accent:tokens.color.primitive['copper-700']};
const stateLabel=computed(()=>props.state==='loading'?'Загружаем событие…':props.state==='checking'?'Проверяем доступ…':props.state==='deleted'?'Событие удалено':'Не удалось проверить доступ');
</script>
<template>
 <article v-lino-surface="{kind:'day'}" class="uc-card figma-event-card" :class="{'uc-card-locked':locked}" :aria-busy="state==='checking'||state==='loading'">
  <button v-if="showClose!==false" type="button" class="uc-card-close" :data-sound-hover="embedded?'':'smallHover'" aria-label="Закрыть карточку события" @click="emit('close')"><LinoIcon name="close"/></button>
  <LinoTag class="figma-card-tier" :title="event.access"><span class="figma-card-access-label">{{ event.access }}</span></LinoTag>
  <div class="figma-card-base" :inert="locked?true:undefined">
   <div class="figma-card-cover"><img v-if="event.cover" :src="event.cover" alt=""/></div>
   <div class="figma-card-content">
    <div class="figma-card-copy"><h3 class="uc-card-name">{{ event.title }}</h3><p class="uc-card-date">{{ date }}</p><p v-if="event.description" class="uc-card-desc">{{ event.description }}</p></div>
    <div class="figma-card-actions">
    <MentorButton v-bind="buttonSounds" v-if="embedded || event.url" full-width class="figma-card-button" :palette="palette" decor-left="/assets/calendar/figma-card/button-left.png" decor-right="/assets/calendar/figma-card/button-right.png" frame-asset="/assets/calendar/figma-card/button-frame.png" :href="embedded?undefined:event.url" :target="embedded?undefined:'_blank'" @click="embedded?emit('manage'):emit('follow')">{{ embedded?'Настройки события':'К событию' }}</MentorButton>
    <p v-else class="figma-missing-url">Ссылка участия пока не указана.</p>
    <MentorButton v-bind="buttonSounds" v-if="!embedded && event.canFollow && (calendarHref || event.calendarUrl)" full-width :variant="1" class="figma-card-button figma-calendar-add" :href="calendarHref || event.calendarUrl" target="_blank">Добавить в календарь</MentorButton>
    </div>
   </div>
  </div>
  <div v-if="locked" class="figma-card-gate" aria-live="polite">
   <div class="figma-gate-art" aria-hidden="true"><img src="/assets/calendar/figma-card/gate-art.png" alt=""/></div>
   <div class="figma-gate-message"><img class="figma-gate-lock" src="/assets/calendar/figma-card/lock.svg" alt=""/><h4>{{ state==='idle'?'Нет доступа':stateLabel }}</h4><p v-if="state==='idle'">Вы пока что не можете перейти<br/>к событию</p></div>
   <MentorButton v-bind="buttonSounds" full-width class="figma-card-button figma-gate-button" :palette="palette" decor-left="/assets/calendar/figma-card/button-left.png" decor-right="/assets/calendar/figma-card/button-right.png" frame-asset="/assets/calendar/figma-card/button-frame.png" @click="state==='idle'?undefined:emit('retry')">{{ state==='idle'?'Узнать условия':'Повторить' }}</MentorButton>
  </div>
  <slot/>
 </article>
</template>
<style scoped>
.figma-event-card.uc-card{position:relative;display:block;width:var(--event-detail-width);min-height:var(--event-detail-height);padding:0;--surface-border:var(--copper-700);--lino-surface:var(--white-100);color:var(--text-primary);animation:none;}
.figma-card-base{display:flex;flex-direction:column;min-height:var(--event-detail-height);}
.figma-card-cover{position:relative;flex:none;height:var(--event-detail-cover);overflow:hidden;}
.figma-card-cover>img{display:block;width:100%;height:100%;padding:0;object-fit:cover;object-position:center;}
.figma-card-tier{position:absolute;top:var(--space-2);left:var(--space-2);z-index:4;gap:var(--space-1);max-width:calc(100% - var(--space-16));--icon-size:var(--icon-sm);}
.figma-card-access-label{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.figma-lodge-icon{width:var(--icon-sm);height:var(--icon-sm);object-fit:contain;flex:none;}
.figma-card-content{box-sizing:border-box;display:flex;flex:1;flex-direction:column;justify-content:space-between;gap:var(--space-6);min-height:var(--event-detail-content);padding:var(--space-4);}
.figma-event-card .uc-card-name{margin:0 0 calc(var(--heading-sm-line) - var(--event-title-line));color:var(--text-primary);font:700 var(--event-title-size)/var(--event-title-line) var(--font-display-family);letter-spacing:-.03em;}
.figma-event-card .uc-card-date{margin:var(--space-2) 0 0;color:var(--text-primary);opacity:.6;font:400 var(--heading-sm-size)/var(--heading-sm-line) var(--font-display-family);letter-spacing:-.03em;}
.figma-event-card .uc-card-desc{margin:var(--space-4) 0 0;color:var(--text-primary);font:400 var(--body-sm-size)/var(--body-sm-line) var(--font-body-family);white-space:pre-wrap;}
.figma-card-button{flex:none;}
.figma-card-actions{display:flex;flex-direction:column;gap:var(--space-3);width:100%;}
.figma-event-card :deep(.figma-card-button.app-button){height:var(--control-confirm);min-height:var(--control-confirm);font:700 var(--control-lg-size)/normal var(--font-display-family);letter-spacing:-.03em;}
.figma-event-card :deep(.app-button__decor){height:var(--control-confirm);object-fit:fill;}
.figma-event-card :deep(.app-button__border){height:auto;}
.figma-event-card :deep(.figma-gate-button.app-button){width:calc(100% - var(--space-8));z-index:2;}
.figma-card-gate{position:absolute;inset:0;overflow:hidden;color:var(--white-100);}
.uc-card-locked .figma-card-base{filter:blur(var(--event-detail-blur));clip-path:inset(0);}
.figma-card-gate::before{content:'';position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse var(--event-detail-gradient-x) var(--event-detail-gradient-y) at 50% 52%,rgb(0 0 0 / .4),rgb(22 17 17 / .605) 50%,rgb(43 33 33 / .81));}
.figma-gate-art{position:absolute;inset:0;z-index:1;overflow:hidden;opacity:.59;mix-blend-mode:exclusion;backdrop-filter:blur(var(--event-detail-blur));}
.figma-gate-art img{position:absolute;max-width:none;width:175.21%;height:108.38%;left:-37.6%;top:-5.5%;}
.figma-gate-message{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:var(--event-detail-message);max-width:calc(100% - var(--space-8));display:flex;flex-direction:column;align-items:center;gap:var(--space-2);text-align:center;z-index:2;}
.figma-gate-lock{width:var(--space-12);height:var(--space-12);}
.figma-gate-message h4{margin:0;color:inherit;font:700 var(--heading-md-size)/var(--event-title-line) var(--font-display-family);}
.figma-gate-message p{margin:0;font:400 var(--body-sm-size)/var(--body-sm-line) var(--font-body-family);}
.figma-gate-button{position:absolute;left:var(--space-4);bottom:var(--space-4);width:calc(100% - var(--space-8));}
.figma-event-card .uc-card-close{position:absolute;top:var(--space-2);right:var(--space-2);width:var(--control-compact);height:var(--control-compact);padding:0;border:0;display:grid;place-items:center;--icon-size:var(--icon-sm);color:var(--text-primary);background:var(--white-90) url('/assets/calendar/nav-bg.png') center / 49px 49px no-repeat;z-index:4;font:400 var(--heading-sm-size)/1 var(--font-body-family);cursor:pointer;}
.figma-event-card .uc-card-close:focus-visible{outline:var(--focus-ring);outline-offset:calc(-1 * var(--focus-offset));}
.figma-card-conditions{position:relative;z-index:3;padding:var(--space-4);background:var(--white-100);color:var(--text-primary);font:400 var(--body-sm-size)/var(--body-sm-line) var(--font-body-family);}
.figma-missing-url{margin:0;font:400 var(--body-sm-size)/var(--body-sm-line) var(--font-body-family);}
@media(max-width:900px){.figma-event-card.uc-card{width:100%;}}
@media(max-width:700px){.figma-event-card .uc-card-close{position:absolute;top:var(--space-2);right:var(--space-2);width:var(--control-compact);height:var(--control-compact);}}
@media(max-width:700px){
 .figma-card-actions{gap:var(--space-4);}
 .figma-event-card :deep(.app-button__border){height:calc(100% + var(--space-2));}
 .figma-event-card :deep(.app-button__decor){width:auto;max-width:none;object-fit:contain;}
}
</style>
