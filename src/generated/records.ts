// Generated from vendor/liblcf-csv by `pnpm run generate` – do not edit.
// Field tables derived from EasyRPG/liblcf (MIT, © 2014-2025 liblcf authors),
// https://github.com/EasyRPG/liblcf @ 666e6c0. See the root LICENSE.

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

export interface ManiacMessageHookFlags {
  userEvent: boolean
  createWindow: boolean
  destroyWindow: boolean
  textRendering: boolean
}

export interface SavePictureFlags {
  eraseOnMapChange: boolean
  eraseOnBattleEnd: boolean
  unusedBit: boolean
  unusedBit2: boolean
  affectedByTint: boolean
  affectedByFlash: boolean
  affectedByShake: boolean
}

export interface EasyRpgEventRuntimeFlags {
  reserved1: boolean
}

export interface EasyRpgFrameRuntimeFlags {
  reserved1: boolean
}

export interface EasyRpgStateRuntimeFlags {
  confOverrideActive: boolean
  reserved1: boolean
  reserved2: boolean
  reserved3: boolean
  patchDestinyOn: boolean
  patchDestinyOff: boolean
  patchDynrpgOn: boolean
  patchDynrpgOff: boolean
  patchManiacOn: boolean
  patchManiacOff: boolean
  patchCommonThisEventOn: boolean
  patchCommonThisEventOff: boolean
  patchUnlockPicsOn: boolean
  patchUnlockPicsOff: boolean
  patchKeypatchOn: boolean
  patchKeypatchOff: boolean
  patchRpg2k3CmdsOn: boolean
  patchRpg2k3CmdsOff: boolean
  useRpg2kBattleSystemOn: boolean
  useRpg2kBattleSystemOff: boolean
}

export interface SaveEasyRpgWindowFlags {
  drawFrame: boolean
  borderMargin: boolean
}

export interface SaveEasyRpgTextFlags {
  drawGradient: boolean
  drawShadow: boolean
  bold: boolean
  italic: boolean
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
  easyrpgActorai: number
  easyrpgPreventCritical: boolean
  easyrpgRaiseEvasion: boolean
  easyrpgImmuneToAttributeDownshifts: boolean
  easyrpgIgnoreEvasion: boolean
  easyrpgUnarmedHit: number
  easyrpgUnarmedStateSet: boolean[]
  easyrpgUnarmedStateChance: number
  easyrpgUnarmedAttributeSet: boolean[]
  easyrpgDualAttack: boolean
  easyrpgAttackAll: boolean
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
  easyrpgDefaultAtbMode: number
  easyrpgEnableBattleRowCommand: boolean
  easyrpgSequentialOrder: boolean
  easyrpgDisableRowFeature: boolean
  easyrpgFixedActorFacingDirection: number
  easyrpgFixedEnemyFacingDirection: number
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
  easyrpgBattle2k3Message: string
  easyrpgIgnoreReflect: boolean
  easyrpgStateHit: number
  easyrpgAttributeHit: number
  easyrpgIgnoreRestrictSkill: boolean
  easyrpgIgnoreRestrictMagic: boolean
  easyrpgEnableStatAbsorbing: boolean
  easyrpgAffectedByEvadeAllPhysicalAttacks: boolean
  easyrpgCriticalHitChance: number
  easyrpgAffectedByRowModifiers: boolean
  easyrpgHpType: number
  easyrpgHpPercent: number
  easyrpgHpCost: number
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
  easyrpgUsingMessage: string
  easyrpgMaxCount: number
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
  maniacUnarmedAnimation: number
  easyrpgEnemyai: number
  easyrpgPreventCritical: boolean
  easyrpgRaiseEvasion: boolean
  easyrpgImmuneToAttributeDownshifts: boolean
  easyrpgIgnoreEvasion: boolean
  easyrpgHit: number
  easyrpgStateSet: boolean[]
  easyrpgStateChance: number
  easyrpgAttributeSet: boolean[]
  easyrpgSuperGuard: boolean
  easyrpgAttackAll: boolean
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
  easyrpgDamageInPercent: boolean
  easyrpgDamageCanKill: boolean
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
  easyrpgImmuneStates: boolean[]
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
  maniacItemReceivedA: string
  maniacLevelUpA: string
  maniacLevelUpB: string
  maniacLevelUpC: string
  maniacExpReceivedA: string
  maniacSkillLearnedA: string
  easyrpgItemNumberSeparator: string
  easyrpgSkillCostSeparator: string
  easyrpgEquipmentArrow: string
  easyrpgStatusSceneName: string
  easyrpgStatusSceneClass: string
  easyrpgStatusSceneTitle: string
  easyrpgStatusSceneCondition: string
  easyrpgStatusSceneFront: string
  easyrpgStatusSceneBack: string
  easyrpgOrderSceneConfirm: string
  easyrpgOrderSceneRedo: string
  easyrpgBattle2k3DoubleAttack: string
  easyrpgBattle2k3Defend: string
  easyrpgBattle2k3Observe: string
  easyrpgBattle2k3Charge: string
  easyrpgBattle2k3Selfdestruct: string
  easyrpgBattle2k3Escape: string
  easyrpgBattle2k3SpecialCombatBack: string
  easyrpgBattle2k3Skill: string
  easyrpgBattle2k3Item: string
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
  easyrpgAlternativeExp: number
  easyrpgBattleOptions: number[]
  easyrpgMaxActorHp: number
  easyrpgMaxEnemyHp: number
  easyrpgMaxDamage: number
  easyrpgMaxExp: number
  easyrpgMaxLevel: number
  easyrpgMaxSavefiles: number
  easyrpgMaxItemCount: number
  easyrpgVariableMinValue: number
  easyrpgVariableMaxValue: number
  easyrpgMaxActorSp: number
  easyrpgMaxEnemySp: number
  easyrpgMaxStatBaseValue: number
  easyrpgMaxStatBattleValue: number
  easyrpgUseRpg2kBattleSystem: boolean
  easyrpgBattleUseRpg2keStrings: boolean
  easyrpgUseRpg2kBattleCommands: boolean
  easyrpgDefaultActorai: number
  easyrpgDefaultEnemyai: number
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
  maniacStringVariables: StringVariable[]
  _header?: string
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
  _header?: string
  _unknown?: UnknownChunk[]
}

export interface SaveTitle {
  timestamp: number
  heroName: string
  heroLevel: number
  heroHp: number
  face1Name: string
  face1Id: number
  face2Name: string
  face2Id: number
  face3Name: string
  face3Id: number
  face4Name: string
  face4Id: number
  _unknown?: UnknownChunk[]
}

export interface SaveSystem {
  scene: number
  frameCount: number
  graphicsName: string
  messageStretch: number
  fontId: number
  switches: boolean[]
  variables: number[]
  messageTransparent: number
  messagePosition: number
  messagePreventOverlap: number
  messageContinueEvents: number
  faceName: string
  faceId: number
  faceRight: boolean
  faceFlip: boolean
  eventMessageActive: boolean
  musicStopping: boolean
  titleMusic: Music
  battleMusic: Music
  battleEndMusic: Music
  innMusic: Music
  currentMusic: Music
  beforeVehicleMusic: Music
  beforeBattleMusic: Music
  storedMusic: Music
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
  teleportAllowed: boolean
  escapeAllowed: boolean
  saveAllowed: boolean
  menuAllowed: boolean
  background: string
  saveCount: number
  saveSlot: number
  atbMode: number
  maniacStrings: string[]
  maniacMessageWindowWidth: number
  maniacMessageWindowHeight: number
  maniacMessageFontName: string
  maniacMessageFontSize: number
  maniacMessageHookFlags: ManiacMessageHookFlags
  maniacMessageHookCommonEventId: number
  maniacMessageHookCallbackSystemVariable: number
  maniacMessageHookCallbackSystemStringVariable: number
  maniacMessageHookCallbackUserVariable: number
  maniacMessageHookCallbackUserStringVariable: number
  maniacFrameskip: number
  maniacPictureLimit: number
  maniacOptions: number[]
  maniacJoypadBindings: number[]
  maniacMessageSpacingChar: number
  maniacMessageSpacingLine: number
  _unknown?: UnknownChunk[]
}

export interface SaveScreen {
  tintFinishRed: number
  tintFinishGreen: number
  tintFinishBlue: number
  tintFinishSat: number
  tintCurrentRed: number
  tintCurrentGreen: number
  tintCurrentBlue: number
  tintCurrentSat: number
  tintTimeLeft: number
  flashContinuous: boolean
  flashRed: number
  flashGreen: number
  flashBlue: number
  flashCurrentLevel: number
  flashTimeLeft: number
  shakeContinuous: boolean
  shakeStrength: number
  shakeSpeed: number
  shakePosition: number
  shakePositionY: number
  shakeTimeLeft: number
  panX: number
  panY: number
  battleanimId: number
  battleanimTarget: number
  battleanimFrame: number
  battleanimActive: boolean
  battleanimGlobal: boolean
  weather: number
  weatherStrength: number
  _unknown?: UnknownChunk[]
}

export interface SavePicture {
  id: number
  name: string
  startX: number
  startY: number
  currentX: number
  currentY: number
  fixedToMap: boolean
  currentMagnify: number
  currentTopTrans: number
  useTransparentColor: boolean
  currentRed: number
  currentGreen: number
  currentBlue: number
  currentSat: number
  effectMode: number
  currentEffectPower: number
  currentBotTrans: number
  spritesheetCols: number
  spritesheetRows: number
  spritesheetFrame: number
  spritesheetSpeed: number
  frames: number
  spritesheetPlayOnce: boolean
  mapLayer: number
  battleLayer: number
  flags: SavePictureFlags
  finishX: number
  finishY: number
  finishMagnify: number
  finishTopTrans: number
  finishBotTrans: number
  finishRed: number
  finishGreen: number
  finishBlue: number
  finishSat: number
  finishEffectPower: number
  timeLeft: number
  currentRotation: number
  currentWaver: number
  easyrpgFlip: number
  easyrpgBlendMode: number
  easyrpgType: number
  maniacCurrentMagnifyHeight: number
  maniacImageData: number[]
  maniacFinishMagnifyHeight: number
  _unknown?: UnknownChunk[]
}

export interface SavePartyLocation {
  active: boolean
  mapId: number
  positionX: number
  positionY: number
  direction: number
  facing: number
  animFrame: number
  transparency: number
  remainingStep: number
  moveFrequency: number
  layer: number
  overlapForbidden: boolean
  animationType: number
  lockFacing: boolean
  moveSpeed: number
  moveRoute: MoveRoute
  moveRouteOverwrite: boolean
  moveRouteIndex: number
  moveRouteFinished: boolean
  spriteHidden: boolean
  moveRouteThrough: boolean
  animPaused: number
  through: boolean
  stopCount: number
  animCount: number
  maxStopCount: number
  jumping: boolean
  beginJumpX: number
  beginJumpY: number
  pause: boolean
  flying: boolean
  spriteName: string
  spriteId: number
  processed: boolean
  flashRed: number
  flashGreen: number
  flashBlue: number
  flashCurrentLevel: number
  flashTimeLeft: number
  easyrpgMoveFailureCount: number
  easyrpgCloneMapId: number
  easyrpgCloneEventId: number
  easyrpgRuntimeFlags: EasyRpgEventRuntimeFlags
  boarding: boolean
  aboard: boolean
  vehicle: number
  unboarding: boolean
  preboardMoveSpeed: number
  menuCalling: boolean
  panState: number
  panCurrentX: number
  panCurrentY: number
  panFinishX: number
  panFinishY: number
  panSpeed: number
  totalEncounterRate: number
  encounterCalling: boolean
  mapSaveCount: number
  databaseSaveCount: number
  maniacHorizontalPanSpeed: number
  maniacVerticalPanSpeed: number
  _unknown?: UnknownChunk[]
}

export interface SaveVehicleLocation {
  active: boolean
  mapId: number
  positionX: number
  positionY: number
  direction: number
  facing: number
  animFrame: number
  transparency: number
  remainingStep: number
  moveFrequency: number
  layer: number
  overlapForbidden: boolean
  animationType: number
  lockFacing: boolean
  moveSpeed: number
  moveRoute: MoveRoute
  moveRouteOverwrite: boolean
  moveRouteIndex: number
  moveRouteFinished: boolean
  spriteHidden: boolean
  moveRouteThrough: boolean
  animPaused: number
  through: boolean
  stopCount: number
  animCount: number
  maxStopCount: number
  jumping: boolean
  beginJumpX: number
  beginJumpY: number
  pause: boolean
  flying: boolean
  spriteName: string
  spriteId: number
  processed: boolean
  flashRed: number
  flashGreen: number
  flashBlue: number
  flashCurrentLevel: number
  flashTimeLeft: number
  easyrpgMoveFailureCount: number
  easyrpgCloneMapId: number
  easyrpgCloneEventId: number
  easyrpgRuntimeFlags: EasyRpgEventRuntimeFlags
  vehicle: number
  remainingAscent: number
  remainingDescent: number
  origSpriteName: string
  origSpriteId: number
  _unknown?: UnknownChunk[]
}

export interface SaveActor {
  id: number
  name: string
  title: string
  spriteName: string
  spriteId: number
  transparency: number
  faceName: string
  faceId: number
  level: number
  exp: number
  hpMod: number
  spMod: number
  attackMod: number
  defenseMod: number
  spiritMod: number
  agilityMod: number
  skills: number[]
  equipped: number[]
  currentHp: number
  currentSp: number
  battleCommands: number[]
  status: number[]
  changedBattleCommands: boolean
  classId: number
  row: number
  twoWeapon: boolean
  lockEquipment: boolean
  autoBattle: boolean
  superGuard: boolean
  battlerAnimation: number
  _unknown?: UnknownChunk[]
}

export interface SaveInventory {
  party: number[]
  itemIds: number[]
  itemCounts: number[]
  itemUsage: number[]
  gold: number
  timer1Frames: number
  timer1Active: boolean
  timer1Visible: boolean
  timer1Battle: boolean
  timer2Frames: number
  timer2Active: boolean
  timer2Visible: boolean
  timer2Battle: boolean
  battles: number
  defeats: number
  escapes: number
  victories: number
  turns: number
  steps: number
  _unknown?: UnknownChunk[]
}

export interface SaveTarget {
  id: number
  mapId: number
  mapX: number
  mapY: number
  switchOn: boolean
  switchId: number
  _unknown?: UnknownChunk[]
}

export interface SaveEventExecFrame {
  id: number
  commands: EventCommand[]
  currentCommand: number
  eventId: number
  triggeredByDecisionKey: boolean
  subcommandPath: number[]
  maniacEventInfo: number
  maniacEventId: number
  maniacEventPageId: number
  maniacLoopInfoSize: number
  maniacLoopInfo: number[]
  easyrpgRuntimeFlags: EasyRpgFrameRuntimeFlags
  _unknown?: UnknownChunk[]
}

export interface SaveEventExecState {
  stack: SaveEventExecFrame[]
  showMessage: boolean
  abortOnEscape: boolean
  waitMovement: boolean
  keyinputWait: boolean
  keyinputVariable: number
  keyinputAllDirections: boolean
  keyinputDecision: number
  keyinputCancel: number
  keyinput2kshift2k3numbers: number
  keyinput2kdown2k3operators: number
  keyinput2kleft2k3shift: number
  keyinput2kright: number
  keyinput2kup: number
  waitTime: number
  keyinputTimeVariable: number
  keyinput2k3down: number
  keyinput2k3left: number
  keyinput2k3right: number
  keyinput2k3up: number
  keyinputTimed: boolean
  waitKeyEnter: boolean
  easyrpgActive: boolean
  easyrpgString: string
  easyrpgParameters: number[]
  easyrpgRuntimeFlags: EasyRpgStateRuntimeFlags
  _unknown?: UnknownChunk[]
}

export interface SaveMapEventBase {
  active: boolean
  mapId: number
  positionX: number
  positionY: number
  direction: number
  facing: number
  animFrame: number
  transparency: number
  remainingStep: number
  moveFrequency: number
  layer: number
  overlapForbidden: boolean
  animationType: number
  lockFacing: boolean
  moveSpeed: number
  moveRoute: MoveRoute
  moveRouteOverwrite: boolean
  moveRouteIndex: number
  moveRouteFinished: boolean
  spriteHidden: boolean
  moveRouteThrough: boolean
  animPaused: number
  through: boolean
  stopCount: number
  animCount: number
  maxStopCount: number
  jumping: boolean
  beginJumpX: number
  beginJumpY: number
  pause: boolean
  flying: boolean
  spriteName: string
  spriteId: number
  processed: boolean
  flashRed: number
  flashGreen: number
  flashBlue: number
  flashCurrentLevel: number
  flashTimeLeft: number
  easyrpgMoveFailureCount: number
  easyrpgCloneMapId: number
  easyrpgCloneEventId: number
  easyrpgRuntimeFlags: EasyRpgEventRuntimeFlags
  _unknown?: UnknownChunk[]
}

export interface SaveMapEvent {
  id: number
  active: boolean
  mapId: number
  positionX: number
  positionY: number
  direction: number
  facing: number
  animFrame: number
  transparency: number
  remainingStep: number
  moveFrequency: number
  layer: number
  overlapForbidden: boolean
  animationType: number
  lockFacing: boolean
  moveSpeed: number
  moveRoute: MoveRoute
  moveRouteOverwrite: boolean
  moveRouteIndex: number
  moveRouteFinished: boolean
  spriteHidden: boolean
  moveRouteThrough: boolean
  animPaused: number
  through: boolean
  stopCount: number
  animCount: number
  maxStopCount: number
  jumping: boolean
  beginJumpX: number
  beginJumpY: number
  pause: boolean
  flying: boolean
  spriteName: string
  spriteId: number
  processed: boolean
  flashRed: number
  flashGreen: number
  flashBlue: number
  flashCurrentLevel: number
  flashTimeLeft: number
  easyrpgMoveFailureCount: number
  easyrpgCloneMapId: number
  easyrpgCloneEventId: number
  easyrpgRuntimeFlags: EasyRpgEventRuntimeFlags
  waitingExecution: boolean
  originalMoveRouteIndex: number
  triggeredByDecisionKey: boolean
  parallelEventExecstate: SaveEventExecState
  _unknown?: UnknownChunk[]
}

export interface SaveMapInfo {
  positionX: number
  positionY: number
  encounterSteps: number
  chipsetId: number
  events: SaveMapEvent[]
  lowerTiles: number[]
  upperTiles: number[]
  parallaxName: string
  parallaxHorz: boolean
  parallaxVert: boolean
  parallaxHorzAuto: boolean
  parallaxHorzSpeed: number
  parallaxVertAuto: boolean
  parallaxVertSpeed: number
  _unknown?: UnknownChunk[]
}

export interface SaveCommonEvent {
  id: number
  parallelEventExecstate: SaveEventExecState
  _unknown?: UnknownChunk[]
}

export interface SavePanorama {
  panX: number
  panY: number
  _unknown?: UnknownChunk[]
}

export interface Save {
  title: SaveTitle
  system: SaveSystem
  screen: SaveScreen
  pictures: SavePicture[]
  partyLocation: SavePartyLocation
  boatLocation: SaveVehicleLocation
  shipLocation: SaveVehicleLocation
  airshipLocation: SaveVehicleLocation
  actors: SaveActor[]
  inventory: SaveInventory
  targets: SaveTarget[]
  mapInfo: SaveMapInfo
  panorama: SavePanorama
  foregroundEventExecstate: SaveEventExecState
  commonEvents: SaveCommonEvent[]
  easyrpgData: SaveEasyRpgData
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
  _header?: string
}

export interface StringVariable {
  id: number
  name: string
  _unknown?: UnknownChunk[]
}

export interface SaveEasyRpgData {
  version: number
  codepage: number
  windows: SaveEasyRpgWindow[]
  _unknown?: UnknownChunk[]
}

export interface SaveEasyRpgWindow {
  id: number
  texts: SaveEasyRpgText[]
  width: number
  height: number
  systemName: string
  messageStretch: number
  flags: SaveEasyRpgWindowFlags
  _unknown?: UnknownChunk[]
}

export interface SaveEasyRpgText {
  text: string
  positionX: number
  positionY: number
  fontName: string
  fontSize: number
  letterSpacing: number
  lineSpacing: number
  flags: SaveEasyRpgTextFlags
  _unknown?: UnknownChunk[]
}
