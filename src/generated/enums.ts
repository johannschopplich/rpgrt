// Generated from vendor/liblcf-csv by `pnpm run generate` – do not edit.
// Field tables derived from EasyRPG/liblcf (MIT, © 2014-2025 liblcf authors),
// https://github.com/EasyRPG/liblcf @ 666e6c0. See the root LICENSE.

export const AnimationPosition = {
  up: 0,
  middle: 1,
  down: 2,
} as const

export const AnimationScope = {
  target: 0,
  screen: 1,
} as const

export const AnimationTimingFlashScope = {
  nothing: 0,
  target: 1,
  screen: 2,
} as const

export const AnimationTimingScreenShake = {
  nothing: 0,
  target: 1,
  screen: 2,
} as const

export const AttributeType = {
  physical: 0,
  magical: 1,
} as const

export const BattleCommandsBattleType = {
  traditional: 0,
  alternative: 1,
  gauge: 2,
} as const

export const BattleCommandsFacing = {
  retain: 0,
  up: 1,
  right: 2,
  down: 3,
  left: 4,
} as const

export const BattleCommandsPlacement = {
  manual: 0,
  automatic: 1,
} as const

export const BattleCommandsRowShown = {
  front: 0,
  back: 1,
} as const

export const BattleCommandsTransparency = {
  opaque: 0,
  transparent: 1,
} as const

export const BattleCommandsWindowSize = {
  large: 0,
  small: 1,
} as const

export const BattleCommandType = {
  attack: 0,
  skill: 1,
  subskill: 2,
  defense: 3,
  item: 4,
  escape: 5,
  special: 6,
} as const

export const BattlerAnimationItemSkillAfterimage = {
  none: 0,
  add: 1,
} as const

export const BattlerAnimationItemSkillAnimType = {
  weapon: 0,
  battle: 1,
} as const

export const BattlerAnimationItemSkillMovement = {
  none: 0,
  step: 1,
  jump: 2,
  move: 3,
} as const

export const BattlerAnimationItemSkillSpeed = {
  fast: 0,
  medium: 1,
  slow: 2,
} as const

export const BattlerAnimationPoseAnimType = {
  character: 0,
  battle: 1,
} as const

export const BattlerAnimationSpeed = {
  slow: 20,
  medium: 14,
  fast: 8,
} as const

export const ChipsetAnimType = {
  reciprocating: 0,
  cyclic: 1,
} as const

export const CommonEventTrigger = {
  automatic: 3,
  parallel: 4,
  call: 5,
  maniacBattleStart: 6,
  maniacBattleParallel: 7,
} as const

export const EnemyActionBasic = {
  attack: 0,
  dualAttack: 1,
  defense: 2,
  observe: 3,
  charge: 4,
  autodestruction: 5,
  escape: 6,
  nothing: 7,
} as const

export const EnemyActionConditionType = {
  always: 0,
  switch: 1,
  turn: 2,
  actors: 3,
  hp: 4,
  sp: 5,
  partyLvl: 6,
  partyFatigue: 7,
} as const

export const EnemyActionKind = {
  basic: 0,
  skill: 1,
  transformation: 2,
} as const

export const EventCommandCode = {
  END: 10,
  CallCommonEvent: 1005,
  ForceFlee: 1006,
  EnableCombo: 1007,
  ChangeClass: 1008,
  ChangeBattleCommands: 1009,
  OpenLoadMenu: 5001,
  ExitGame: 5002,
  ToggleAtbMode: 5003,
  ToggleFullscreen: 5004,
  OpenVideoOptions: 5005,
  ShowMessage: 10110,
  MessageOptions: 10120,
  ChangeFaceGraphic: 10130,
  ShowChoice: 10140,
  InputNumber: 10150,
  ControlSwitches: 10210,
  ControlVars: 10220,
  TimerOperation: 10230,
  ChangeGold: 10310,
  ChangeItems: 10320,
  ChangePartyMembers: 10330,
  ChangeExp: 10410,
  ChangeLevel: 10420,
  ChangeParameters: 10430,
  ChangeSkills: 10440,
  ChangeEquipment: 10450,
  ChangeHP: 10460,
  ChangeSP: 10470,
  ChangeCondition: 10480,
  FullHeal: 10490,
  SimulatedAttack: 10500,
  ChangeHeroName: 10610,
  ChangeHeroTitle: 10620,
  ChangeSpriteAssociation: 10630,
  ChangeActorFace: 10640,
  ChangeVehicleGraphic: 10650,
  ChangeSystemBGM: 10660,
  ChangeSystemSFX: 10670,
  ChangeSystemGraphics: 10680,
  ChangeScreenTransitions: 10690,
  EnemyEncounter: 10710,
  OpenShop: 10720,
  ShowInn: 10730,
  EnterHeroName: 10740,
  Teleport: 10810,
  MemorizeLocation: 10820,
  RecallToLocation: 10830,
  EnterExitVehicle: 10840,
  SetVehicleLocation: 10850,
  ChangeEventLocation: 10860,
  TradeEventLocations: 10870,
  StoreTerrainID: 10910,
  StoreEventID: 10920,
  EraseScreen: 11010,
  ShowScreen: 11020,
  TintScreen: 11030,
  FlashScreen: 11040,
  ShakeScreen: 11050,
  PanScreen: 11060,
  WeatherEffects: 11070,
  ShowPicture: 11110,
  MovePicture: 11120,
  ErasePicture: 11130,
  ShowBattleAnimation: 11210,
  PlayerVisibility: 11310,
  FlashSprite: 11320,
  MoveEvent: 11330,
  ProceedWithMovement: 11340,
  HaltAllMovement: 11350,
  Wait: 11410,
  PlayBGM: 11510,
  FadeOutBGM: 11520,
  MemorizeBGM: 11530,
  PlayMemorizedBGM: 11540,
  PlaySound: 11550,
  PlayMovie: 11560,
  KeyInputProc: 11610,
  ChangeMapTileset: 11710,
  ChangePBG: 11720,
  ChangeEncounterSteps: 11740,
  TileSubstitution: 11750,
  TeleportTargets: 11810,
  ChangeTeleportAccess: 11820,
  EscapeTarget: 11830,
  ChangeEscapeAccess: 11840,
  OpenSaveMenu: 11910,
  ChangeSaveAccess: 11930,
  OpenMainMenu: 11950,
  ChangeMainMenuAccess: 11960,
  ConditionalBranch: 12010,
  Label: 12110,
  JumpToLabel: 12120,
  Loop: 12210,
  BreakLoop: 12220,
  EndEventProcessing: 12310,
  EraseEvent: 12320,
  CallEvent: 12330,
  Comment: 12410,
  GameOver: 12420,
  ReturntoTitleScreen: 12510,
  ChangeMonsterHP: 13110,
  ChangeMonsterMP: 13120,
  ChangeMonsterCondition: 13130,
  ShowHiddenMonster: 13150,
  ChangeBattleBG: 13210,
  ShowBattleAnimationB: 13260,
  ConditionalBranchB: 13310,
  TerminateBattle: 13410,
  ShowMessage2: 20110,
  ShowChoiceOption: 20140,
  ShowChoiceEnd: 20141,
  VictoryHandler: 20710,
  EscapeHandler: 20711,
  DefeatHandler: 20712,
  EndBattle: 20713,
  Transaction: 20720,
  NoTransaction: 20721,
  EndShop: 20722,
  Stay: 20730,
  NoStay: 20731,
  EndInn: 20732,
  ElseBranch: 22010,
  EndBranch: 22011,
  EndLoop: 22210,
  Comment2: 22410,
  ElseBranchB: 23310,
  EndBranchB: 23311,
  EasyRpgTriggerEventAt: 2002,
  EasyRpgPathfinder: 2003,
  EasyRpgCallMovementAction: 2050,
  EasyRpgWaitForSingleMovement: 2051,
  EasyRpgAnimateVariable: 2052,
  EasyRpgSetInterpreterFlag: 2053,
  EasyRpgProcessJson: 2055,
  EasyRpgCloneMapEvent: 2056,
  EasyRpgDestroyMapEvent: 2057,
  EasyRpgStringPictureMenu: 2058,
  ManiacGetSaveInfo: 3001,
  ManiacSave: 3002,
  ManiacLoad: 3003,
  ManiacEndLoadProcess: 3004,
  ManiacGetMousePosition: 3005,
  ManiacSetMousePosition: 3006,
  ManiacShowStringPicture: 3007,
  ManiacGetPictureInfo: 3008,
  ManiacControlBattle: 3009,
  ManiacControlAtbGauge: 3010,
  ManiacChangeBattleCommandEx: 3011,
  ManiacGetBattleInfo: 3012,
  ManiacControlVarArray: 3013,
  ManiacKeyInputProcEx: 3014,
  ManiacRewriteMap: 3015,
  ManiacControlGlobalSave: 3016,
  ManiacChangePictureId: 3017,
  ManiacSetGameOption: 3018,
  ManiacCallCommand: 3019,
  ManiacControlStrings: 3020,
  ManiacGetGameInfo: 3021,
  ManiacEditPicture: 3025,
  ManiacWritePicture: 3026,
  ManiacAddMoveRoute: 3027,
  ManiacEditTile: 3028,
  ManiacControlTextProcessing: 3029,
  ManiacZoom: 3032,
} as const

export const EventPageAnimType = {
  nonContinuous: 0,
  continuous: 1,
  fixedNonContinuous: 2,
  fixedContinuous: 3,
  fixedGraphic: 4,
  spin: 5,
  stepFrameFix: 6,
} as const

export const EventPageConditionComparison = {
  equal: 0,
  greaterEqual: 1,
  lessEqual: 2,
  greater: 3,
  less: 4,
  notEqual: 5,
} as const

export const EventPageDirection = {
  up: 0,
  right: 1,
  down: 2,
  left: 3,
} as const

export const EventPageFrame = {
  left: 0,
  middle: 1,
  right: 2,
  middle2: 3,
} as const

export const EventPageLayers = {
  below: 0,
  same: 1,
  above: 2,
} as const

export const EventPageMoveSpeed = {
  eighth: 1,
  quarter: 2,
  half: 3,
  normal: 4,
  double: 5,
  fourfold: 6,
} as const

export const EventPageMoveType = {
  stationary: 0,
  random: 1,
  vertical: 2,
  horizontal: 3,
  toward: 4,
  away: 5,
  custom: 6,
} as const

export const EventPageTrigger = {
  action: 0,
  touched: 1,
  collision: 2,
  autoStart: 3,
  parallel: 4,
} as const

export const ItemTarget = {
  single: 0,
  center: 1,
  simultaneous: 2,
  sequential: 3,
} as const

export const ItemTrajectory = {
  straight: 0,
  return: 1,
} as const

export const ItemType = {
  normal: 0,
  weapon: 1,
  shield: 2,
  armor: 3,
  helmet: 4,
  accessory: 5,
  medicine: 6,
  book: 7,
  material: 8,
  special: 9,
  switch: 10,
} as const

export const MapGeneratorMode = {
  singlePassage: 0,
  linkedRooms: 1,
  mazePassage: 2,
  openRoom: 3,
} as const

export const MapGeneratorTiles = {
  one: 0,
  two: 1,
} as const

export const MapInfoBGMType = {
  parent: 0,
  terrain: 1,
  specific: 2,
} as const

export const MapInfoMusicType = {
  parent: 0,
  event: 1,
  specific: 2,
} as const

export const MapInfoTriState = {
  parent: 0,
  allow: 1,
  forbid: 2,
} as const

export const MapScrollType = {
  none: 0,
  vertical: 1,
  horizontal: 2,
  both: 3,
} as const

export const MoveCommandCode = {
  moveUp: 0,
  moveRight: 1,
  moveDown: 2,
  moveLeft: 3,
  moveUpright: 4,
  moveDownright: 5,
  moveDownleft: 6,
  moveUpleft: 7,
  moveRandom: 8,
  moveTowardsHero: 9,
  moveAwayFromHero: 10,
  moveForward: 11,
  faceUp: 12,
  faceRight: 13,
  faceDown: 14,
  faceLeft: 15,
  turn90DegreeRight: 16,
  turn90DegreeLeft: 17,
  turn180Degree: 18,
  turn90DegreeRandom: 19,
  faceRandomDirection: 20,
  faceHero: 21,
  faceAwayFromHero: 22,
  wait: 23,
  beginJump: 24,
  endJump: 25,
  lockFacing: 26,
  unlockFacing: 27,
  increaseMovementSpeed: 28,
  decreaseMovementSpeed: 29,
  increaseMovementFrequence: 30,
  decreaseMovementFrequence: 31,
  switchOn: 32,
  switchOff: 33,
  changeGraphic: 34,
  playSoundEffect: 35,
  walkEverywhereOn: 36,
  walkEverywhereOff: 37,
  stopAnimation: 38,
  startAnimation: 39,
  increaseTransp: 40,
  decreaseTransp: 41,
} as const

export const SaveActorRowType = {
  front: 0,
  back: 1,
} as const

export const SavePartyLocationPanState = {
  fixed: 0,
  follow: 1,
} as const

export const SavePartyLocationVehicleType = {
  none: 0,
  skiff: 1,
  ship: 2,
  airship: 3,
} as const

export const SavePictureBattleLayer = {
  none: 0,
  background: 1,
  battlersAndAnimations: 2,
  weather: 3,
  windowsAndStatus: 4,
  timers: 5,
} as const

export const SavePictureEasyRpgFlip = {
  none: 0,
  x: 1,
  y: 2,
  both: 3,
} as const

export const SavePictureEasyRpgType = {
  default: 0,
  window: 1,
  canvas: 2,
} as const

export const SavePictureEffect = {
  none: 0,
  rotation: 1,
  wave: 2,
  maniacFixedAngle: 3,
} as const

export const SavePictureMapLayer = {
  none: 0,
  parallax: 1,
  tilemapBelow: 2,
  eventsBelow: 3,
  eventsSameAsPlayer: 4,
  tilemapAbove: 5,
  eventsAbove: 6,
  weather: 7,
  animations: 8,
  windows: 9,
  timers: 10,
} as const

export const SaveSystemAtbMode = {
  atbActive: 0,
  atbWait: 1,
} as const

export const SaveSystemScene = {
  map: 0,
  menu: 1,
  battle: 2,
  shop: 3,
  name: 4,
  file: 5,
  title: 6,
  gameOver: 7,
  debug: 8,
} as const

export const SaveVehicleLocationVehicleType = {
  none: 0,
  skiff: 1,
  ship: 2,
  airship: 3,
} as const

export const SkillScope = {
  enemy: 0,
  enemies: 1,
  self: 2,
  ally: 3,
  party: 4,
} as const

export const SkillSpType = {
  cost: 0,
  percent: 1,
} as const

export const SkillType = {
  normal: 0,
  teleport: 1,
  escape: 2,
  switch: 3,
  subskill: 4,
} as const

export const StateAffectType = {
  half: 0,
  double: 1,
  nothing: 2,
} as const

export const StateChangeType = {
  lose: 0,
  gain: 1,
  nothing: 2,
} as const

export const StatePersistence = {
  ends: 0,
  persists: 1,
} as const

export const StateRestriction = {
  normal: 0,
  doNothing: 1,
  attackEnemy: 2,
  attackAlly: 3,
} as const

export const SystemBattleCondition = {
  none: 0,
  initiative: 1,
  back: 2,
  surround: 3,
  pincers: 4,
} as const

export const SystemBattleFormation = {
  terrain: 0,
  loose: 1,
  tight: 2,
} as const

export const SystemEquipmentSetting = {
  actor: 0,
  class: 1,
} as const

export const SystemFadeIn = {
  default: 0,
  fadeIn: 1,
  reconstituteBlocks: 2,
  unwipeDownward: 3,
  unwipeUpward: 4,
  venetianBlinds: 5,
  verticalBlinds: 6,
  horizontalBlinds: 7,
  recedingSquare: 8,
  expandingSquare: 9,
  screenMovesDown: 10,
  screenMovesUp: 11,
  screenMovesRight: 12,
  screenMovesLeft: 13,
  verticalUnify: 14,
  horizontalUnify: 15,
  unifyQuadrants: 16,
  zoomOut: 17,
  mosaic: 18,
  waverScreen: 19,
  instantaneous: 20,
  none: 21,
} as const

export const SystemFadeOut = {
  default: 0,
  fadeOut: 1,
  removeBlocks: 2,
  wipeDownward: 3,
  wipeUpward: 4,
  venetianBlinds: 5,
  verticalBlinds: 6,
  horizontalBlinds: 7,
  recedingSquare: 8,
  expandingSquare: 9,
  screenMovesUp: 10,
  screenMovesDown: 11,
  screenMovesLeft: 12,
  screenMovesRight: 13,
  verticalDiv: 14,
  horizontalDiv: 15,
  quadrasection: 16,
  zoomIn: 17,
  mosaic: 18,
  waverScreen: 19,
  instantaneous: 20,
  none: 21,
} as const

export const SystemFont = {
  gothic: 0,
  mincho: 1,
} as const

export const SystemStretch = {
  stretch: 0,
  tiled: 1,
  easyrpgNone: 2,
} as const

export const TerrainBGAssociation = {
  background: 0,
  frame: 1,
} as const

export const TerrainBushDepth = {
  normal: 0,
  third: 1,
  half: 2,
  full: 3,
} as const

export const TreeMapMapType = {
  root: 0,
  map: 1,
  area: 2,
} as const
