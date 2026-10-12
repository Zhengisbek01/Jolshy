export const NETWORK_KM = 1588;

export const DEFECTS = {
  pothole: { name: 'Яма, выбоина', short: 'Яма', camera: true },
  marking: { name: 'Стёртая разметка', short: 'Разметка', camera: true },
  sign: { name: 'Повреждённый или отсутствующий знак', short: 'Знак', camera: true },
  crack: { name: 'Трещины покрытия', short: 'Трещины' },
  rut: { name: 'Колейность', short: 'Колея' },
  barrier: { name: 'Повреждено ограждение', short: 'Ограждение' },
  edge: { name: 'Разрушение кромки и обочины', short: 'Кромка' },
};
export const DK = Object.keys(DEFECTS);
export const CAMERA_TYPES = DK.filter((k) => DEFECTS[k].camera);

export const SEV = {
  high: { name: 'Опасный', cls: 'bad' },
  mid: { name: 'Средний', cls: 'warn' },
  low: { name: 'Незначительный', cls: 'neutral' },
};

/* Demo norms for elimination, hours. Configured by the administrator. */
export const DEFAULT_NORMS = {
  pothole: { high: 24, mid: 72, low: 168 },
  marking: { high: 168, mid: 336, low: 336 },
  sign: { high: 24, mid: 72, low: 168 },
  crack: { high: 168, mid: 336, low: 720 },
  rut: { high: 168, mid: 336, low: 720 },
  barrier: { high: 48, mid: 168, low: 336 },
  edge: { high: 72, mid: 168, low: 336 },
};

export const SOURCES = {
  camera: { name: 'Камера ТС', cls: 'info' },
  inspector: { name: 'Инспектор', cls: 'ok' },
  c109: { name: 'Обращение 109', cls: 'warn' },
};

export const STATUS = {
  detected: { name: 'ИИ: на проверке', cls: 'info', color: 'var(--st-detected)' },
  nogeo: { name: 'Нет геопривязки', cls: 'warn', color: 'var(--st-nogeo)' },
  assigned: { name: 'Передан подрядчику', cls: 'warn', color: 'var(--st-assigned)' },
  in_work: { name: 'В работе', cls: 'warn', color: 'var(--st-work)' },
  fixed: { name: 'Устранён, ждёт приёмки', cls: 'info', color: 'var(--st-fixed)' },
  returned: { name: 'Возвращён на доработку', cls: 'bad', color: 'var(--st-returned)' },
  closed: { name: 'Принят', cls: 'ok', color: 'var(--st-closed)' },
  rejected: { name: 'Ложное срабатывание', cls: 'neutral', color: 'var(--st-rejected)' },
};
export const OPEN = ['assigned', 'in_work', 'returned'];

export const ROLES = {
  dispatcher: { name: 'Диспетчер ЦУД', group: 'Центр управления дорогами' },
  inspector: { name: 'Инспектор дорог', group: 'Центр управления дорогами' },
  contractor: { name: 'Подрядчик', group: 'Подрядчики' },
  head: { name: 'Руководитель управления', group: 'Управление и акимат' },
  akimat: { name: 'Акимат', group: 'Управление и акимат' },
  admin: { name: 'Администратор', group: 'Управление и акимат' },
};

export const CONTRACTORS = [
  { id: 'k1', name: 'ТОО «ДорСтрой-Север» (демо)', net: 'oblast' },
  { id: 'k2', name: 'ТОО «Жол Құрылыс» (демо)', net: 'oblast' },
  { id: 'k3', name: 'ТОО «АвтоДор-Сервис» (демо)', net: 'oblast' },
  { id: 'k4', name: 'ГКП «Городские дороги» (демо)', net: 'city' },
];

export const ORGS = [
  { id: 'cud', name: 'Центр управления дорогами (демо)', type: 'cud' },
  { id: 'uad', name: 'Управление автомобильных дорог (демо)', type: 'uad' },
  { id: 'akimat', name: 'Аппарат акима области (демо)', type: 'gov' },
  { id: 'platform', name: 'Jolshy, оператор платформы', type: 'platform' },
  ...CONTRACTORS.map((c) => ({ id: c.id, name: c.name, type: 'contractor' })),
];

export const USERS = [
  { id: 'u-d1', login: 'dispatcher1', name: 'Айдана Жумабекова', role: 'dispatcher', org: 'cud' },
  { id: 'u-d2', login: 'dispatcher2', name: 'Арман Сейткали', role: 'dispatcher', org: 'cud' },
  { id: 'u-i1', login: 'inspector1', name: 'Ерболат Кусаинов', role: 'inspector', org: 'cud', zone: ['k1'] },
  { id: 'u-i2', login: 'inspector2', name: 'Нурсултан Абенов', role: 'inspector', org: 'cud', zone: ['k2', 'k3'] },
  { id: 'u-i3', login: 'inspector3', name: 'Дина Омарова', role: 'inspector', org: 'cud', zone: ['k4'] },
  { id: 'u-k1', login: 'podryad1', name: 'Серик Байжанов', role: 'contractor', org: 'k1' },
  { id: 'u-k2', login: 'podryad2', name: 'Канат Тулегенов', role: 'contractor', org: 'k2' },
  { id: 'u-k3', login: 'podryad3', name: 'Игорь Ким', role: 'contractor', org: 'k3' },
  { id: 'u-k4', login: 'podryad4', name: 'Ажар Садыкова', role: 'contractor', org: 'k4' },
  { id: 'u-h', login: 'upravlenie', name: 'Бакыт Ермеков', role: 'head', org: 'uad' },
  { id: 'u-a', login: 'akimat', name: 'Алия Мухамеджанова', role: 'akimat', org: 'akimat' },
  { id: 'u-adm', login: 'admin', name: 'Тимур Ли', role: 'admin', org: 'platform' },
];

export const TOWNS = ['Аксу', 'Береке', 'Жаңаталап', 'Көктерек', 'Сарыбұлақ', 'Тасқала', 'Қызылту', 'Ақсай', 'Жайма', 'Балықты'];
export const STREETS_NS = ['ул. Абая', 'ул. Сейфуллина', 'ул. Кенесары', 'ул. Жамбыла', 'ул. Ауэзова', 'ул. Валиханова', 'ул. Пушкина', 'ул. Байтурсынова', 'ул. Майлина', 'ул. Гоголя', 'ул. Толе би', 'ул. Казыбек би'];
export const STREETS_EW = ['пр. Республики', 'пр. Независимости', 'ул. Сатпаева', 'ул. Желтоксан', 'ул. Бокейхана', 'ул. Иманова', 'ул. Кунаева', 'ул. Достык', 'ул. Мира', 'ул. Ломоносова', 'ул. Шокана', 'ул. Есенберлина'];
