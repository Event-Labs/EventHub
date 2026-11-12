/**
 * Universal Bank Directory & Resolver for Vietnamese Banks (VietQR / Napas / CITAD)
 * Supports resolution by:
 * - 6-digit NAPAS BIN (e.g. '970418', '970422')
 * - 8-digit CITAD code (e.g. '01202001' for BIDV, '01311001' for MB)
 * - 3-digit bank identifier within CITAD (e.g. '202' for BIDV, '311' for MB)
 * - Bank short name / code (e.g. 'BIDV', 'MB', 'MB Bank', 'VCB', 'Vietcombank')
 * - Full bank name / aliases
 */

export const VIETNAMESE_BANKS = [
  {
    code: 'VCB',
    shortName: 'Vietcombank',
    fullName: 'Ngân hàng TMCP Ngoại thương Việt Nam',
    bin: '970436',
    citad3: '203',
    citads: ['01203001', '79203001'],
    aliases: ['vcb', 'vietcom', 'vietcombank', 'ngan hang ngoai thuong'],
  },
  {
    code: 'CTG',
    shortName: 'VietinBank',
    fullName: 'Ngân hàng TMCP Công thương Việt Nam',
    bin: '970415',
    citad3: '201',
    citads: ['01201001', '79201001'],
    aliases: ['ctg', 'vietin', 'vietinbank', 'ngan hang cong thuong'],
  },
  {
    code: 'BIDV',
    shortName: 'BIDV',
    fullName: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam',
    bin: '970418',
    citad3: '202',
    citads: ['01202001', '79202001'],
    aliases: ['bidv', 'ngan hang dau tu va phat trien', 'dau tu va phat trien'],
  },
  {
    code: 'VBA',
    shortName: 'Agribank',
    fullName: 'Ngân hàng Nông nghiệp và PTNT Việt Nam',
    bin: '970405',
    citad3: '204',
    citads: ['01204001', '01204009', '79204001'],
    aliases: ['vba', 'agri', 'agribank', 'nong nghiep', 'nong nghiep va phat trien nong thon'],
  },
  {
    code: 'TCB',
    shortName: 'Techcombank',
    fullName: 'Ngân hàng TMCP Kỹ thương Việt Nam',
    bin: '970407',
    citad3: '310',
    citads: ['01310001', '79310001'],
    aliases: ['tcb', 'techcom', 'techcombank', 'ky thuong'],
  },
  {
    code: 'MB',
    shortName: 'MB Bank',
    fullName: 'Ngân hàng TMCP Quân đội',
    bin: '970422',
    citad3: '311',
    citads: ['01311001', '79311001'],
    aliases: ['mb', 'mbbank', 'mb bank', 'quan doi'],
  },
  {
    code: 'ACB',
    shortName: 'ACB',
    fullName: 'Ngân hàng TMCP Á Châu',
    bin: '970416',
    citad3: '307',
    citads: ['79307001', '01307001'],
    aliases: ['acb', 'a chau'],
  },
  {
    code: 'VPB',
    shortName: 'VPBank',
    fullName: 'Ngân hàng TMCP Việt Nam Thịnh Vượng',
    bin: '970432',
    citad3: '309',
    citads: ['01309001', '79309001'],
    aliases: ['vpb', 'vpbank', 'viet nam thinh vuong'],
  },
  {
    code: 'TPB',
    shortName: 'TPBank',
    fullName: 'Ngân hàng TMCP Tiên Phong',
    bin: '970423',
    citad3: '358',
    citads: ['01358001', '79358001'],
    aliases: ['tpb', 'tpbank', 'tien phong'],
  },
  {
    code: 'STB',
    shortName: 'Sacombank',
    fullName: 'Ngân hàng TMCP Sài Gòn Thương Tín',
    bin: '970403',
    citad3: '303',
    citads: ['79303001', '01303001'],
    aliases: ['stb', 'sacom', 'sacombank', 'sai gon thuong tin'],
  },
  {
    code: 'HDB',
    shortName: 'HDBank',
    fullName: 'Ngân hàng TMCP Phát triển TP.HCM',
    bin: '970437',
    citad3: '321',
    citads: ['79321001', '01321001'],
    aliases: ['hdb', 'hdbank', 'phat trien tp hcm'],
  },
  {
    code: 'VIB',
    shortName: 'VIB',
    fullName: 'Ngân hàng TMCP Quốc tế Việt Nam',
    bin: '970441',
    citad3: '314',
    citads: ['79314013', '01314001'],
    aliases: ['vib', 'quoc te'],
  },
  {
    code: 'SHB',
    shortName: 'SHB',
    fullName: 'Ngân hàng TMCP Sài Gòn - Hà Nội',
    bin: '970443',
    citad3: '348',
    citads: ['01348002', '79348001'],
    aliases: ['shb', 'sai gon ha noi'],
  },
  {
    code: 'SSB',
    shortName: 'SeABank',
    fullName: 'Ngân hàng TMCP Đông Nam Á',
    bin: '970468',
    citad3: '317',
    citads: ['01317001', '79317001'],
    aliases: ['ssb', 'sea', 'seabank', 'dong nam a'],
  },
  {
    code: 'OCB',
    shortName: 'OCB',
    fullName: 'Ngân hàng TMCP Phương Đông',
    bin: '970448',
    citad3: '333',
    citads: ['79333001', '01333001'],
    aliases: ['ocb', 'phuong dong'],
  },
  {
    code: 'MSB',
    shortName: 'MSB',
    fullName: 'Ngân hàng TMCP Hàng Hải Việt Nam',
    bin: '970426',
    citad3: '302',
    citads: ['01302001', '79302001'],
    aliases: ['msb', 'hang hai'],
  },
  {
    code: 'LPB',
    shortName: 'LPBank',
    fullName: 'Ngân hàng TMCP Lộc Phát Việt Nam',
    bin: '970449',
    citad3: '357',
    citads: ['01357001', '79357001'],
    aliases: ['lpb', 'lpbank', 'loc phat', 'lienviet', 'lienvietpostbank'],
  },
  {
    code: 'PVCB',
    shortName: 'PVcomBank',
    fullName: 'Ngân hàng TMCP Đại Chúng Việt Nam',
    bin: '970412',
    citad3: '360',
    citads: ['01360002', '79360001'],
    aliases: ['pvcb', 'pvcom', 'pvcombank', 'dai chung'],
  },
  {
    code: 'BAB',
    shortName: 'Bac A Bank',
    fullName: 'Ngân hàng TMCP Bắc Á',
    bin: '970409',
    citad3: '313',
    citads: ['01313001', '79313001'],
    aliases: ['bab', 'bac a', 'bacabank'],
  },
  {
    code: 'NAB',
    shortName: 'Nam A Bank',
    fullName: 'Ngân hàng TMCP Nam Á',
    bin: '970428',
    citad3: '306',
    citads: ['01306001', '79306001'],
    aliases: ['nab', 'nam a', 'namabank'],
  },
  {
    code: 'KLB',
    shortName: 'Kienlongbank',
    fullName: 'Ngân hàng TMCP Kiên Long',
    bin: '970452',
    citad3: ['353', '368'],
    citads: ['01368001', '79368001'],
    aliases: ['klb', 'kien long', 'kienlongbank'],
  },
  {
    code: 'BVB',
    shortName: 'BVBank',
    fullName: 'Ngân hàng TMCP Bản Việt',
    bin: '970454',
    citad3: ['327', '356'],
    citads: ['79327001', '79356001', '01356001'],
    aliases: ['bvb', 'bvbank', 'ban viet', 'viet capital'],
  },
  {
    code: 'BAOVIET',
    shortName: 'BaoViet Bank',
    fullName: 'Ngân hàng TMCP Bảo Việt',
    bin: '970438',
    citad3: ['339', '359'],
    citads: ['01359001', '79359001'],
    aliases: ['baoviet', 'baovietbank', 'bao viet'],
  },
  {
    code: 'SGB',
    shortName: 'Saigonbank',
    fullName: 'Ngân hàng TMCP Sài Gòn Công Thương',
    bin: '970400',
    citad3: '308',
    citads: ['79308001', '01308001'],
    aliases: ['sgb', 'saigonbank', 'sai gon cong thuong'],
  },
  {
    code: 'VBB',
    shortName: 'VietBank',
    fullName: 'Ngân hàng TMCP Việt Nam Thương Tín',
    bin: '970433',
    citad3: '335',
    citads: ['79309001', '01335001'],
    aliases: ['vbb', 'vietbank', 'viet nam thuong tin'],
  },
  {
    code: 'NCB',
    shortName: 'NCB',
    fullName: 'Ngân hàng TMCP Quốc Dân',
    bin: '970419',
    citad3: '352',
    citads: ['01352002', '79352001'],
    aliases: ['ncb', 'quoc dan'],
  },
  {
    code: 'EIB',
    shortName: 'Eximbank',
    fullName: 'Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam',
    bin: '970431',
    citad3: '305',
    citads: ['79305001', '01305001'],
    aliases: ['eib', 'exim', 'eximbank', 'xuat nhap khau'],
  },
  {
    code: 'ABB',
    shortName: 'ABBank',
    fullName: 'Ngân hàng TMCP An Bình',
    bin: '970425',
    citad3: '323',
    citads: ['01323002', '79323001'],
    aliases: ['abb', 'abbank', 'an binh'],
  },
  {
    code: 'VAB',
    shortName: 'VietABank',
    fullName: 'Ngân hàng TMCP Việt Á',
    bin: '970427',
    citad3: '355',
    citads: ['01355002', '79355001'],
    aliases: ['vab', 'vieta', 'vietabank', 'viet a'],
  },
  {
    code: 'SHBVN',
    shortName: 'Shinhan Bank',
    fullName: 'Ngân hàng TNHH MTV Shinhan Việt Nam',
    bin: '970424',
    citad3: '616',
    citads: ['79616001', '01616001'],
    aliases: ['shinhan', 'shinhanbank'],
  },
  {
    code: 'WRB',
    shortName: 'Woori Bank',
    fullName: 'Ngân hàng TNHH MTV Woori Việt Nam',
    bin: '970457',
    citad3: ['637', '663'],
    citads: ['79663001', '01637001'],
    aliases: ['woori', 'wooribank'],
  },
  {
    code: 'PBVN',
    shortName: 'Public Bank',
    fullName: 'Ngân hàng TNHH MTV Public Việt Nam',
    bin: '970439',
    citad3: '501',
    citads: ['01501001', '79501001'],
    aliases: ['public', 'publicbank'],
  },
  {
    code: 'HLBVN',
    shortName: 'Hong Leong Bank',
    fullName: 'Ngân hàng TNHH MTV Hong Leong Việt Nam',
    bin: '970442',
    citad3: '602',
    citads: ['79602001', '01602001'],
    aliases: ['hong leong', 'hongleong'],
  },
  {
    code: 'HSBC',
    shortName: 'HSBC',
    fullName: 'Ngân hàng TNHH MTV HSBC (Việt Nam)',
    bin: '458761',
    citad3: '617',
    citads: ['79617001', '01617001'],
    aliases: ['hsbc'],
  },
  {
    code: 'SCBVL',
    shortName: 'Standard Chartered',
    fullName: 'Ngân hàng TNHH MTV Standard Chartered Việt Nam',
    bin: '970410',
    citad3: '604',
    citads: ['01604001', '79604001'],
    aliases: ['standard chartered', 'stanchart'],
  },
  {
    code: 'IVB',
    shortName: 'Indovina Bank',
    fullName: 'Ngân hàng TNHH Indovina',
    bin: '970434',
    citad3: '502',
    citads: ['79502001', '01502001'],
    aliases: ['ivb', 'indovina'],
  },
  {
    code: 'VRB',
    shortName: 'VRB',
    fullName: 'Ngân hàng Liên doanh Việt - Nga',
    bin: '970421',
    citad3: '505',
    citads: ['01505001', '79505001'],
    aliases: ['vrb', 'viet nga'],
  },
  {
    code: 'SCB',
    shortName: 'SCB',
    fullName: 'Ngân hàng TMCP Sài Gòn',
    bin: '970429',
    citad3: '334',
    citads: ['79334001', '01334001'],
    aliases: ['scb', 'sai gon'],
  },
  {
    code: 'PGB',
    shortName: 'PGBank',
    fullName: 'Ngân hàng TMCP Thịnh vượng và Phát triển',
    bin: '970430',
    citad3: '341',
    citads: ['01341001', '79341001'],
    aliases: ['pgb', 'pgbank', 'xang dau'],
  },
  {
    code: 'CAKE',
    shortName: 'Cake by VPBank',
    fullName: 'Ngân hàng số Cake by VPBank',
    bin: '546034',
    citad3: '309',
    aliases: ['cake'],
  },
  {
    code: 'TIMO',
    shortName: 'Timo',
    fullName: 'Ngân hàng số Timo by BVBank',
    bin: '963388',
    citad3: '356',
    aliases: ['timo'],
  },
  {
    code: 'VTLMONEY',
    shortName: 'Viettel Money',
    fullName: 'Tổng Công ty Dịch vụ Số Viettel',
    bin: '971005',
    aliases: ['viettel', 'viettelmoney', 'viettel pay'],
  },
  {
    code: 'VNPTMONEY',
    shortName: 'VNPT Money',
    fullName: 'Tập đoàn Bưu chính Viễn thông Việt Nam',
    bin: '971011',
    aliases: ['vnpt', 'vnptmoney'],
  },
  {
    code: 'CIMB',
    shortName: 'CIMB',
    fullName: 'Ngân hàng TNHH MTV CIMB Việt Nam',
    bin: '422589',
    citad3: '603',
    citads: ['01603001', '79603001'],
    aliases: ['cimb'],
  },
  {
    code: 'UOB',
    shortName: 'UOB',
    fullName: 'Ngân hàng TNHH MTV United Overseas Bank Việt Nam',
    bin: '970458',
    citad3: '605',
    citads: ['79605001', '01605001'],
    aliases: ['uob'],
  },
]

/**
 * Tạo chuỗi hiển thị tên ngân hàng: Tên viết tắt (mã) - Tên đầy đủ
 */
export function getBankDisplayName(bank) {
  if (!bank) return ''
  if (bank.shortName === bank.code) {
    return `${bank.shortName} - ${bank.fullName}`
  }
  return `${bank.shortName} (${bank.code}) - ${bank.fullName}`
}

/**
 * Phân giải đối tượng ngân hàng đầy đủ từ mã BIN (6 số), mã CITAD (8 số), mã viết tắt hoặc tên
 */
export function resolveBank(bankInput) {
  if (!bankInput) return null
  if (typeof bankInput === 'object') {
    if (bankInput.bin && bankInput.shortName) return bankInput
    bankInput =
      bankInput.bin ||
      bankInput.shortName ||
      bankInput.code ||
      bankInput.name ||
      bankInput.fullName ||
      ''
  }
  const str = String(bankInput).trim()
  if (!str) return null

  // 1. Khớp mã BIN 6 số
  if (/^\d{6}$/.test(str)) {
    const found = VIETNAMESE_BANKS.find((b) => b.bin === str)
    if (found) return found
  }

  // 2. Khớp mã CITAD 8 số (ví dụ: '01202001' của BIDV -> '202' -> BIDV)
  if (/^\d{8}$/.test(str)) {
    const exactCitad = VIETNAMESE_BANKS.find((b) => b.citads && b.citads.includes(str))
    if (exactCitad) return exactCitad

    const citad3 = str.slice(2, 5)
    const foundByCitad3 = VIETNAMESE_BANKS.find(
      (b) => b.citad3 === citad3 || (Array.isArray(b.citad3) && b.citad3.includes(citad3))
    )
    if (foundByCitad3) return foundByCitad3
  }

  // 3. Khớp mã 3 số CITAD (ví dụ: '202' -> BIDV)
  if (/^\d{3}$/.test(str)) {
    const foundByCitad3 = VIETNAMESE_BANKS.find(
      (b) => b.citad3 === str || (Array.isArray(b.citad3) && b.citad3.includes(citad3))
    )
    if (foundByCitad3) return foundByCitad3
  }

  // 4. Khớp chính xác mã ngân hàng, tên viết tắt hoặc alias
  const lower = str.toLowerCase()
  const exact = VIETNAMESE_BANKS.find(
    (b) =>
      b.code?.toLowerCase() === lower ||
      b.shortName?.toLowerCase() === lower ||
      (b.aliases && b.aliases.some((a) => a.toLowerCase() === lower))
  )
  if (exact) return exact

  // 5. Khớp mờ / chứa chuỗi
  const fuzzy = VIETNAMESE_BANKS.find(
    (b) =>
      lower.includes(b.shortName.toLowerCase()) ||
      lower.includes(b.code.toLowerCase()) ||
      b.fullName.toLowerCase().includes(lower) ||
      (b.aliases && b.aliases.some((a) => lower.includes(a.toLowerCase()) || a.toLowerCase().includes(lower)))
  )
  if (fuzzy) return fuzzy

  return null
}

/**
 * Phân giải tên hiển thị thân thiện từ tên, mã hoặc mã BIN/CITAD ngân hàng
 * Ví dụ: '01202001' -> 'BIDV', '970422' -> 'MB Bank', 'MB' -> 'MB Bank'
 */
export function resolveBankName(bankInput) {
  const bank = resolveBank(bankInput)
  if (bank) return bank.shortName
  return typeof bankInput === 'string' ? bankInput.trim() : ''
}

/**
 * Phân giải mã BIN 6 số NAPAS phục vụ tạo mã VietQR hoặc Payout PayOS
 * Ví dụ: 'BIDV' -> '970418', '01202001' -> '970418', 'MB Bank' -> '970422'
 */
export function resolveBankBin(bankInput) {
  const bank = resolveBank(bankInput)
  if (bank) return bank.bin
  if (typeof bankInput === 'string' && /^\d{6}$/.test(bankInput.trim())) {
    return bankInput.trim()
  }
  return null
}
