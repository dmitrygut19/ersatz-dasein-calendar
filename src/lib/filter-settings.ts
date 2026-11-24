import {getDb} from './db';
import {lodges} from './db/schema';
import {HttpError} from './http';
export type FilterSettings={topicLodgeId?:string|null;affiliationDegree?:string|null;communityEvent?:boolean};
export function filterSettings(input:unknown):FilterSettings{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new HttpError(422,'Ожидаются поля события.');
 const raw=input as Record<string,unknown>,result:FilterSettings={};
 if('affiliationDegree' in raw){if(![null,'','I','II','III'].includes(raw.affiliationDegree as string))throw new HttpError(422,'Выберите градус принадлежности I–III.');result.affiliationDegree=raw.affiliationDegree as string||null;}
 if('communityEvent' in raw){if(typeof raw.communityEvent!=='boolean')throw new HttpError(422,'Проверьте принадлежность события.');result.communityEvent=raw.communityEvent;}
 if('topicLodgeId' in raw){const known=new Set(getDb().select({id:lodges.id}).from(lodges).all().map(row=>row.id));if(raw.topicLodgeId!==null&&!known.has(raw.topicLodgeId as string))throw new HttpError(422,'Ложа не найдена.');result.topicLodgeId=raw.topicLodgeId as string|null;}
 return result;
}
