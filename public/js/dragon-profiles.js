// 属性は階層で固定。保存・通信ではelementの文字列だけを運ぶ。
export const DRAGON_ELEMENTS = ['fire', 'ice', 'thunder', 'wind', 'holy', 'void'];
export const DRAGON_PROFILES = {
  fire: { kind: 'dragon', sweep: '旋回尾撃', name: '炎鱗竜ヴォルグ', title: '紅蓮', scales: 0x50232e, membrane: 0x8d3540, armor: 0x171d2c, color: 0xff671b, hot: 0xffd986, breath: '薙ぎ払う劫火', meteor: '墜ちる竜星', order: ['breath','sweep','slam','meteor'], damage: 1, range: 28, angle: Math.PI/9, recovery: 1 },
  ice: { kind: 'giant', sweep: '砕氷の大薙ぎ', name: '氷冠巨人ニヴァリス', title: '氷獄', scales: 0x276d89, membrane: 0x70b9c5, armor: 0x153044, color: 0x6bcfff, hot: 0xdafaff, breath: '凍える白霧', meteor: '氷冠の落槍', order: ['breath','slam','breath','meteor'], damage: .88, range: 26, angle: .46, recovery: 1.1 },
  thunder: { kind: 'beast', sweep: '雷角旋回', name: '雷角獣ヴァジュラ', title: '雷霆', scales: 0x6a4930, membrane: 0x7956ae, armor: 0x282038, color: 0xb693ff, hot: 0xffedac, breath: '雷霆の奔流', meteor: '天雷の鉄槌', order: ['breath','sweep','breath','meteor'], damage: .95, range: 30, angle: .23, recovery: .88 },
  wind: { kind: 'griffin', sweep: '旋風の翼撃', name: '嵐翼グリフォン', title: '颶風', scales: 0x316752, membrane: 0x65a392, armor: 0x1a3431, color: 0x64edbd, hot: 0xd6ffec, breath: '断空の嵐', meteor: '墜嵐', order: ['sweep','breath','sweep','slam'], damage: .82, range: 30, angle: .38, recovery: .84 },
  holy: { kind: 'sentinel', sweep: '聖剣の円斬', name: '聖堂騎像アウレリア', title: '聖光', scales: 0x9e8a62, membrane: 0xd1b878, armor: 0x50536a, color: 0xffcf65, hot: 0xfff5d0, breath: '裁きの光芒', meteor: '天よりの裁定', order: ['slam','breath','meteor','slam'], damage: .92, range: 27, angle: .32, recovery: 1 },
  void: { kind: 'reaper', sweep: '大鎌の断罪', name: '深淵の死神ノクス', title: '深淵', scales: 0x392345, membrane: 0x652e82, armor: 0x111420, color: 0x9c36ed, hot: 0xe4a0ff, breath: '深淵の吐息', meteor: '断滅の黒星', order: ['meteor','breath','slam','sweep'], damage: 1.08, range: 25, angle: .35, recovery: 1.12 },
};
export const dragonElement = (floor, final = false) => final ? 'void' : DRAGON_ELEMENTS[Math.max(0, floor - 1) % DRAGON_ELEMENTS.length];
export const dragonProfile = s => DRAGON_PROFILES[s.element] || DRAGON_PROFILES.fire;
