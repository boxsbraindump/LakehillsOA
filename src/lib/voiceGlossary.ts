const PHRASE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/(?:pay\s*ments?|佩门|培门|付款|付款方式|付款查询)/gi, "payment"],
  [/(?:claims?|克莱姆|理赔|保险理赔)/gi, "claim"],
  [/(?:denials?|地奈尔|拒付|拒绝)/gi, "denial"],
  [/(?:appeals?|上诉|申诉)/gi, "appeal"],
  [/(?:authorization|auth|奥斯|授权)/gi, "authorization"],
  [/(?:prior\s*auth(?:orization)?|预授权|提前授权)/gi, "prior authorization"],
  [/(?:eligibility|资格查询|保险资格)/gi, "eligibility"],
  [/(?:benefits?|保险福利|福利)/gi, "benefits"],
  [/(?:deductible|抵扣|免赔额)/gi, "deductible"],
  [/(?:copay|co\s*pay|扣配|自付额)/gi, "copay"],
  [/(?:coinsurance|co\s*insurance|共同保险)/gi, "coinsurance"],
  [/(?:E\s*O\s*B|伊欧比|一欧比|解释福利)/gi, "EOB"],
  [/(?:E\s*R\s*A|伊阿瑞|电子汇款|电子付款)/gi, "ERA"],
  [/(?:C\s*P\s*T|西皮提|项目代码)/gi, "CPT"],
  [/(?:I\s*C\s*D|诊断代码)/gi, "ICD"],
  [/(?:N\s*P\s*I|恩皮爱|医生号码)/gi, "NPI"],
  [/(?:D\s*O\s*S|date\s*of\s*service|服务日期)/gi, "DOS"],
  [/(?:secondary\s*(?:insurance)?|第二保险|副保险)/gi, "secondary insurance"],
  [/(?:primary\s*(?:insurance)?|第一保险|主保险)/gi, "primary insurance"],
  [/(?:follow\s*up|followup|回访|跟进)/gi, "follow up"],
  [/(?:submit|提交|递交)/gi, "submit"],
  [/(?:resubmit|重新提交|重新递交)/gi, "resubmit"],
  [/(?:portal|入口|平台)/gi, "portal"],
  [/(?:payer|保险公司|付款方)/gi, "payer"],
  [/(?:provider|医生|诊所方)/gi, "provider"],
  [/(?:patient|病人|患者)/gi, "patient"],
  [/(?:Availity|阿维利提|阿维里提|availability)/gi, "Availity"],
  [/(?:Optum|奥普腾|奥普特姆|optem)/gi, "Optum"],
  [/(?:Echo|ECHO|艾可|一口)/gi, "ECHO"],
  [/(?:Premera|普瑞梅拉|普雷梅拉|premera)/gi, "Premera"],
  [/(?:Aetna|艾特纳|埃特纳|aetnah?)/gi, "Aetna"],
  [/(?:Kaiser|凯撒|kaiser)/gi, "Kaiser"],
  [/(?:Regence|瑞金斯|瑞真斯|regions)/gi, "Regence"],
  [/(?:Blue\s*Shield|蓝盾|blue shield)/gi, "Blue Shield"],
  [/(?:Blue\s*Cross|蓝十字|blue cross)/gi, "Blue Cross"],
  [/(?:United\s*Healthcare|UHC|联合医疗|联合健康)/gi, "UnitedHealthcare"],
  [/(?:Medicare|红蓝卡|medicare)/gi, "Medicare"],
  [/(?:Medicaid|白卡|medicaid)/gi, "Medicaid"],
];

const UPPERCASE_TERMS = ["EOB", "ERA", "CPT", "ICD", "NPI", "DOS"];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function spacedCamelCase(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function replaceLatinTerm(text: string, patternText: string, replacement: string) {
  const flexiblePattern = escapeRegExp(patternText.trim()).replace(/\\\s+/g, "[\\s-]+");
  const pattern = new RegExp(`(^|[^A-Za-z0-9])(${flexiblePattern})(?=$|[^A-Za-z0-9])`, "gi");
  return text.replace(pattern, (_match, prefix: string) => `${prefix}${replacement}`);
}

function isAscii(value: string) {
  return Array.from(value).every((char) => char.charCodeAt(0) <= 127);
}

function normalizeCustomTerms(transcript: string, customTerms: string[]) {
  let normalized = transcript;
  const terms = Array.from(
    new Set(customTerms.map((term) => term.replace(/\s+/g, " ").trim()).filter(Boolean)),
  ).sort((a, b) => b.length - a.length);

  for (const term of terms) {
    if (isAscii(term)) {
      normalized = replaceLatinTerm(normalized, term, term);
      const spaced = spacedCamelCase(term);
      if (spaced !== term) normalized = replaceLatinTerm(normalized, spaced, term);
    } else {
      normalized = normalized.replace(new RegExp(escapeRegExp(term), "g"), term);
    }
  }
  return normalized;
}

export function normalizeVoiceTranscript(transcript: string, customTerms: string[] = []) {
  let normalized = transcript.trim();
  for (const [pattern, replacement] of PHRASE_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  normalized = normalizeCustomTerms(normalized, customTerms);
  normalized = normalized.replace(/\s+/g, " ").trim();
  for (const term of UPPERCASE_TERMS) {
    normalized = normalized.replace(new RegExp(`\\b${term}\\b`, "gi"), term);
  }
  return normalized;
}
