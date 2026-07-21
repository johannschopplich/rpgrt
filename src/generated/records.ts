// Generated from vendor/liblcf-csv by `pnpm run generate` – do not edit.

import type { UnknownChunk } from '../codec/descriptors.ts'

export interface TroopPageConditionFlags {
  switchA: boolean
  switchB: boolean
  variable: boolean
  turn: boolean
  fatigue: boolean
  enemyHp: boolean
  actorHp: boolean
  turnEnemy: boolean
  turnActor: boolean
  commandActor: boolean
}

export interface TerrainFlags {
  backParty: boolean
  backEnemies: boolean
  lateralParty: boolean
  lateralEnemies: boolean
}

export interface EventPageConditionFlags {
  switchA: boolean
  switchB: boolean
  variable: boolean
  item: boolean
  actor: boolean
  timer: boolean
  timer2: boolean
}

export interface Parameters {
  maxhp: number[]
  maxsp: number[]
  attack: number[]
  defense: number[]
  spirit: number[]
  agility: number[]
}

export interface Equipment {
  weaponId: number
  shieldId: number
  armorId: number
  helmetId: number
  accessoryId: number
}

export interface EventCommand {
  code: number
  indent: number
  string: string
  parameters: number[]
}

export interface MoveCommand {
  commandId: number
  parameterString: string
  parameterA: number
  parameterB: number
  parameterC: number
}

export interface Learning {
  id: number
  level: number
  skillId: number
  _unknown?: UnknownChunk[]
}

export interface Actor {
  id: number
  name: string
  title: string
  characterName: string
  characterIndex: number
  transparent: boolean
  initialLevel: number
  finalLevel: number
  criticalHit: boolean
  criticalHitChance: number
  faceName: string
  faceIndex: number
  twoWeapon: boolean
  lockEquipment: boolean
  autoBattle: boolean
  superGuard: boolean
  parameters: Parameters
  expBase: number
  expInflation: number
  expCorrection: number
  initialEquipment: Equipment
  unarmedAnimation: number
  classId: number
  battleX: number
  battleY: number
  battlerAnimation: number
  skills: Learning[]
  renameSkill: boolean
  skillName: string
  stateRanks: number[]
  attributeRanks: number[]
  battleCommands: number[]
  _unknown?: UnknownChunk[]
}

export interface Sound {
  name: string
  volume: number
  tempo: number
  balance: number
  _unknown?: UnknownChunk[]
}

export interface AnimationTiming {
  id: number
  frame: number
  se: Sound
  flashScope: number
  flashRed: number
  flashGreen: number
  flashBlue: number
  flashPower: number
  screenShake: number
  _unknown?: UnknownChunk[]
}

export interface AnimationCellData {
  id: number
  valid: number
  cellId: number
  x: number
  y: number
  zoom: number
  toneRed: number
  toneGreen: number
  toneBlue: number
  toneGray: number
  transparency: number
  _unknown?: UnknownChunk[]
}

export interface AnimationFrame {
  id: number
  cells: AnimationCellData[]
  _unknown?: UnknownChunk[]
}

export interface Animation {
  id: number
  name: string
  animationName: string
  large: boolean
  timings: AnimationTiming[]
  scope: number
  position: number
  frames: AnimationFrame[]
  _unknown?: UnknownChunk[]
}

export interface Attribute {
  id: number
  name: string
  type: number
  aRate: number
  bRate: number
  cRate: number
  dRate: number
  eRate: number
  _unknown?: UnknownChunk[]
}

export interface BattleCommand {
  id: number
  name: string
  type: number
  _unknown?: UnknownChunk[]
}

export interface BattleCommands {
  placement: number
  deathHandlerUnused: boolean
  row: number
  battleType: number
  unusedDisplayNormalParameters: boolean
  commands: BattleCommand[]
  deathHandler: boolean
  deathEvent: number
  windowSize: number
  transparency: number
  deathTeleport: boolean
  deathTeleportId: number
  deathTeleportX: number
  deathTeleportY: number
  deathTeleportFace: number
  _unknown?: UnknownChunk[]
}

export interface BattlerAnimation {
  id: number
  name: string
  speed: number
  poses: BattlerAnimationPose[]
  weapons: BattlerAnimationWeapon[]
  _unknown?: UnknownChunk[]
}

export interface BattlerAnimationItemSkill {
  id: number
  unknown02: number
  type: number
  weaponAnimationId: number
  movement: number
  afterImage: number
  attacks: number
  ranged: boolean
  rangedAnimationId: number
  rangedSpeed: number
  battleAnimationId: number
  pose: number
  _unknown?: UnknownChunk[]
}

export interface BattlerAnimationPose {
  id: number
  name: string
  battlerName: string
  battlerIndex: number
  animationType: number
  battleAnimationId: number
  _unknown?: UnknownChunk[]
}

export interface BattlerAnimationWeapon {
  id: number
  name: string
  weaponName: string
  weaponIndex: number
  _unknown?: UnknownChunk[]
}

export interface Chipset {
  id: number
  name: string
  chipsetName: string
  terrainData: number[]
  passableDataLower: number[]
  passableDataUpper: number[]
  animationType: number
  animationSpeed: number
  _unknown?: UnknownChunk[]
}

export interface Class {
  id: number
  name: string
  twoWeapon: boolean
  lockEquipment: boolean
  autoBattle: boolean
  superGuard: boolean
  parameters: Parameters
  expBase: number
  expInflation: number
  expCorrection: number
  battlerAnimation: number
  skills: Learning[]
  stateRanks: number[]
  attributeRanks: number[]
  battleCommands: number[]
  _unknown?: UnknownChunk[]
}

export interface CommonEvent {
  id: number
  name: string
  trigger: number
  switchFlag: boolean
  switchId: number
  eventCommands: EventCommand[]
  _unknown?: UnknownChunk[]
}

export interface Skill {
  id: number
  name: string
  description: string
  usingMessage1: string
  usingMessage2: string
  failureMessage: number
  type: number
  spType: number
  spPercent: number
  spCost: number
  scope: number
  switchId: number
  animationId: number
  soundEffect: Sound
  occasionField: boolean
  occasionBattle: boolean
  reverseStateEffect: boolean
  physicalRate: number
  magicalRate: number
  variance: number
  power: number
  hit: number
  affectHp: boolean
  affectSp: boolean
  affectAttack: boolean
  affectDefense: boolean
  affectSpirit: boolean
  affectAgility: boolean
  absorbDamage: boolean
  ignoreDefense: boolean
  stateEffects: boolean[]
  attributeEffects: boolean[]
  affectAttrDefence: boolean
  battlerAnimation: number
  battlerAnimationData: BattlerAnimationItemSkill[]
  _unknown?: UnknownChunk[]
}

export interface Item {
  id: number
  name: string
  description: string
  type: number
  price: number
  uses: number
  atkPoints1: number
  defPoints1: number
  spiPoints1: number
  agiPoints1: number
  twoHanded: boolean
  spCost: number
  hit: number
  criticalHit: number
  animationId: number
  preemptive: boolean
  dualAttack: boolean
  attackAll: boolean
  ignoreEvasion: boolean
  preventCritical: boolean
  raiseEvasion: boolean
  halfSpCost: boolean
  noTerrainDamage: boolean
  cursed: boolean
  entireParty: boolean
  recoverHpRate: number
  recoverHp: number
  recoverSpRate: number
  recoverSp: number
  occasionField1: boolean
  koOnly: boolean
  maxHpPoints: number
  maxSpPoints: number
  atkPoints2: number
  defPoints2: number
  spiPoints2: number
  agiPoints2: number
  usingMessage: number
  skillId: number
  switchId: number
  occasionField2: boolean
  occasionBattle: boolean
  actorSet: boolean[]
  stateSet: boolean[]
  attributeSet: boolean[]
  stateChance: number
  reverseStateEffect: boolean
  weaponAnimation: number
  animationData: BattlerAnimationItemSkill[]
  useSkill: boolean
  classSet: boolean[]
  rangedTrajectory: number
  rangedTarget: number
  _unknown?: UnknownChunk[]
}

export interface EnemyAction {
  id: number
  kind: number
  basic: number
  skillId: number
  enemyId: number
  conditionType: number
  conditionParam1: number
  conditionParam2: number
  switchId: number
  switchOn: boolean
  switchOnId: number
  switchOff: boolean
  switchOffId: number
  rating: number
  _unknown?: UnknownChunk[]
}

export interface Enemy {
  id: number
  name: string
  battlerName: string
  battlerHue: number
  maxHp: number
  maxSp: number
  attack: number
  defense: number
  spirit: number
  agility: number
  transparent: boolean
  exp: number
  gold: number
  dropId: number
  dropProb: number
  criticalHit: boolean
  criticalHitChance: number
  miss: boolean
  levitate: boolean
  stateRanks: number[]
  attributeRanks: number[]
  actions: EnemyAction[]
  _unknown?: UnknownChunk[]
}

export interface TroopMember {
  id: number
  enemyId: number
  x: number
  y: number
  invisible: boolean
  _unknown?: UnknownChunk[]
}

export interface TroopPageCondition {
  flags: TroopPageConditionFlags
  switchAId: number
  switchBId: number
  variableId: number
  variableValue: number
  turnA: number
  turnB: number
  fatigueMin: number
  fatigueMax: number
  enemyId: number
  enemyHpMin: number
  enemyHpMax: number
  actorId: number
  actorHpMin: number
  actorHpMax: number
  turnEnemyId: number
  turnEnemyA: number
  turnEnemyB: number
  turnActorId: number
  turnActorA: number
  turnActorB: number
  commandActorId: number
  commandId: number
  _unknown?: UnknownChunk[]
}

export interface TroopPage {
  id: number
  condition: TroopPageCondition
  eventCommands: EventCommand[]
  _unknown?: UnknownChunk[]
}

export interface Troop {
  id: number
  name: string
  members: TroopMember[]
  autoAlignment: boolean
  terrainSet: boolean[]
  appearRandomly: boolean
  pages: TroopPage[]
  _unknown?: UnknownChunk[]
}

export interface Terrain {
  id: number
  name: string
  damage: number
  encounterRate: number
  backgroundName: string
  boatPass: boolean
  shipPass: boolean
  airshipPass: boolean
  airshipLand: boolean
  bushDepth: number
  footstep: Sound
  onDamageSe: boolean
  backgroundType: number
  backgroundAName: string
  backgroundAScrollh: boolean
  backgroundAScrollv: boolean
  backgroundAScrollhSpeed: number
  backgroundAScrollvSpeed: number
  backgroundB: boolean
  backgroundBName: string
  backgroundBScrollh: boolean
  backgroundBScrollv: boolean
  backgroundBScrollhSpeed: number
  backgroundBScrollvSpeed: number
  specialFlags: TerrainFlags
  specialBackParty: number
  specialBackEnemies: number
  specialLateralParty: number
  specialLateralEnemies: number
  gridLocation: number
  gridTopY: number
  gridElongation: number
  gridInclination: number
  _unknown?: UnknownChunk[]
}

export interface State {
  id: number
  name: string
  type: number
  color: number
  priority: number
  restriction: number
  aRate: number
  bRate: number
  cRate: number
  dRate: number
  eRate: number
  holdTurn: number
  autoReleaseProb: number
  releaseByDamage: number
  affectType: number
  affectAttack: boolean
  affectDefense: boolean
  affectSpirit: boolean
  affectAgility: boolean
  reduceHitRatio: number
  avoidAttacks: boolean
  reflectMagic: boolean
  cursed: boolean
  battlerAnimationId: number
  restrictSkill: boolean
  restrictSkillLevel: number
  restrictMagic: boolean
  restrictMagicLevel: number
  hpChangeType: number
  spChangeType: number
  messageActor: string
  messageEnemy: string
  messageAlready: string
  messageAffected: string
  messageRecovery: string
  hpChangeMax: number
  hpChangeVal: number
  hpChangeMapSteps: number
  hpChangeMapVal: number
  spChangeMax: number
  spChangeVal: number
  spChangeMapSteps: number
  spChangeMapVal: number
  _unknown?: UnknownChunk[]
}

export interface Terms {
  encounter: string
  specialCombat: string
  escapeSuccess: string
  escapeFailure: string
  victory: string
  defeat: string
  expReceived: string
  goldRecievedA: string
  goldRecievedB: string
  itemRecieved: string
  attacking: string
  enemyCritical: string
  actorCritical: string
  defending: string
  observing: string
  focus: string
  autodestruction: string
  enemyEscape: string
  enemyTransform: string
  enemyDamaged: string
  enemyUndamaged: string
  actorDamaged: string
  actorUndamaged: string
  skillFailureA: string
  skillFailureB: string
  skillFailureC: string
  dodge: string
  useItem: string
  hpRecovery: string
  parameterIncrease: string
  parameterDecrease: string
  enemyHpAbsorbed: string
  actorHpAbsorbed: string
  resistanceIncrease: string
  resistanceDecrease: string
  levelUp: string
  skillLearned: string
  battleStart: string
  miss: string
  shopGreeting1: string
  shopRegreeting1: string
  shopBuy1: string
  shopSell1: string
  shopLeave1: string
  shopBuySelect1: string
  shopBuyNumber1: string
  shopPurchased1: string
  shopSellSelect1: string
  shopSellNumber1: string
  shopSold1: string
  shopGreeting2: string
  shopRegreeting2: string
  shopBuy2: string
  shopSell2: string
  shopLeave2: string
  shopBuySelect2: string
  shopBuyNumber2: string
  shopPurchased2: string
  shopSellSelect2: string
  shopSellNumber2: string
  shopSold2: string
  shopGreeting3: string
  shopRegreeting3: string
  shopBuy3: string
  shopSell3: string
  shopLeave3: string
  shopBuySelect3: string
  shopBuyNumber3: string
  shopPurchased3: string
  shopSellSelect3: string
  shopSellNumber3: string
  shopSold3: string
  innAGreeting1: string
  innAGreeting2: string
  innAGreeting3: string
  innAAccept: string
  innACancel: string
  innBGreeting1: string
  innBGreeting2: string
  innBGreeting3: string
  innBAccept: string
  innBCancel: string
  possessedItems: string
  equippedItems: string
  gold: string
  battleFight: string
  battleAuto: string
  battleEscape: string
  commandAttack: string
  commandDefend: string
  commandItem: string
  commandSkill: string
  menuEquipment: string
  menuSave: string
  menuQuit: string
  newGame: string
  loadGame: string
  exitGame: string
  status: string
  row: string
  order: string
  waitOn: string
  waitOff: string
  level: string
  healthPoints: string
  spiritPoints: string
  normalStatus: string
  expShort: string
  lvlShort: string
  hpShort: string
  spShort: string
  spCost: string
  attack: string
  defense: string
  spirit: string
  agility: string
  weapon: string
  shield: string
  armor: string
  helmet: string
  accessory: string
  saveGameMessage: string
  loadGameMessage: string
  file: string
  exitGameMessage: string
  yes: string
  no: string
  _unknown?: UnknownChunk[]
}

export interface Music {
  name: string
  fadein: number
  volume: number
  tempo: number
  balance: number
  _unknown?: UnknownChunk[]
}

export interface TestBattler {
  id: number
  actorId: number
  level: number
  weaponId: number
  shieldId: number
  armorId: number
  helmetId: number
  accessoryId: number
  _unknown?: UnknownChunk[]
}

export interface System {
  ldbId: number
  boatName: string
  shipName: string
  airshipName: string
  boatIndex: number
  shipIndex: number
  airshipIndex: number
  titleName: string
  gameoverName: string
  systemName: string
  system2Name: string
  party: number[]
  menuCommands: number[]
  titleMusic: Music
  battleMusic: Music
  battleEndMusic: Music
  innMusic: Music
  boatMusic: Music
  shipMusic: Music
  airshipMusic: Music
  gameoverMusic: Music
  cursorSe: Sound
  decisionSe: Sound
  cancelSe: Sound
  buzzerSe: Sound
  battleSe: Sound
  escapeSe: Sound
  enemyAttackSe: Sound
  enemyDamagedSe: Sound
  actorDamagedSe: Sound
  dodgeSe: Sound
  enemyDeathSe: Sound
  itemSe: Sound
  transitionOut: number
  transitionIn: number
  battleStartFadeout: number
  battleStartFadein: number
  battleEndFadeout: number
  battleEndFadein: number
  messageStretch: number
  fontId: number
  selectedCondition: number
  selectedHero: number
  battletestBackground: string
  battletestData: TestBattler[]
  saveCount: number
  battletestTerrain: number
  battletestFormation: number
  battletestCondition: number
  equipmentSetting: number
  battletestAltTerrain: number
  showFrame: boolean
  frameName: string
  invertAnimations: boolean
  showTitle: boolean
  _unknown?: UnknownChunk[]
}

export interface Switch {
  id: number
  name: string
  _unknown?: UnknownChunk[]
}

export interface Variable {
  id: number
  name: string
  _unknown?: UnknownChunk[]
}

export interface Database {
  actors: Actor[]
  skills: Skill[]
  items: Item[]
  enemies: Enemy[]
  troops: Troop[]
  terrains: Terrain[]
  attributes: Attribute[]
  states: State[]
  animations: Animation[]
  chipsets: Chipset[]
  terms: Terms
  system: System
  switches: Switch[]
  variables: Variable[]
  commonevents: CommonEvent[]
  version: number
  battlecommands: BattleCommands
  classes: Class[]
  battleranimations: BattlerAnimation[]
  _unknown?: UnknownChunk[]
}

export interface EventPageCondition {
  flags: EventPageConditionFlags
  switchAId: number
  switchBId: number
  variableId: number
  variableValue: number
  itemId: number
  actorId: number
  timerSec: number
  timer2Sec: number
  compareOperator: number
  _unknown?: UnknownChunk[]
}

export interface MoveRoute {
  moveCommands: MoveCommand[]
  repeat: boolean
  skippable: boolean
  _unknown?: UnknownChunk[]
}

export interface EventPage {
  id: number
  condition: EventPageCondition
  characterName: string
  characterIndex: number
  characterDirection: number
  characterPattern: number
  translucent: boolean
  moveType: number
  moveFrequency: number
  trigger: number
  layer: number
  overlapForbidden: boolean
  animationType: number
  moveSpeed: number
  moveRoute: MoveRoute
  eventCommands: EventCommand[]
  _unknown?: UnknownChunk[]
}

export interface Event {
  id: number
  name: string
  x: number
  y: number
  pages: EventPage[]
  _unknown?: UnknownChunk[]
}

export interface MapUnit {
  chipsetId: number
  width: number
  height: number
  scrollType: number
  parallaxFlag: boolean
  parallaxName: string
  parallaxLoopX: boolean
  parallaxLoopY: boolean
  parallaxAutoLoopX: boolean
  parallaxSx: number
  parallaxAutoLoopY: boolean
  parallaxSy: number
  generatorFlag: boolean
  generatorMode: number
  topLevel: boolean
  generatorTiles: number
  generatorWidth: number
  generatorHeight: number
  generatorSurround: boolean
  generatorUpperWall: boolean
  generatorFloorB: boolean
  generatorFloorC: boolean
  generatorExtraB: boolean
  generatorExtraC: boolean
  generatorX: number[]
  generatorY: number[]
  generatorTileIds: number[]
  lowerLayer: number[]
  upperLayer: number[]
  events: Event[]
  saveCount2k3e: number
  saveCount: number
  _unknown?: UnknownChunk[]
}

export interface Rect {
  l: number
  t: number
  r: number
  b: number
}

export interface Encounter {
  id: number
  troopId: number
  _unknown?: UnknownChunk[]
}

export interface MapInfo {
  id: number
  name: string
  parentMap: number
  indentation: number
  type: number
  scrollbarX: number
  scrollbarY: number
  expandedNode: boolean
  musicType: number
  music: Music
  backgroundType: number
  backgroundName: string
  teleport: number
  escape: number
  save: number
  encounters: Encounter[]
  encounterSteps: number
  areaRect: Rect
  _unknown?: UnknownChunk[]
}

export interface Start {
  partyMapId: number
  partyX: number
  partyY: number
  boatMapId: number
  boatX: number
  boatY: number
  shipMapId: number
  shipX: number
  shipY: number
  airshipMapId: number
  airshipX: number
  airshipY: number
  _unknown?: UnknownChunk[]
}

export interface TreeMap {
  maps: MapInfo[]
  treeOrder: number[]
  activeNode: number
  start: Start
}
