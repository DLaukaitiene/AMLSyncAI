/**
 * Pre-filled national details the firm reviews and saves on its Country Profile [28 Nov 2026].
 * Nothing here is applied until someone saves it. Lithuania: full set (supervisor by sector, holidays);
 * other EU countries: the authorities we could confirm. Keep these current: authorities rename (last checked Nov 2026).
 */
type Contact = { name: string; channel: string };
export interface NationalSuggestions {
  supervisor?: Contact;
  fiu?: Contact;
  sanctionsAuthority?: Contact;
  boRegister?: Contact;
  dataProtectionAuthority?: Contact;
  whistleblowing?: string;
  holidays?: string[];
}

const FNTT: Contact = { name: "Financial Crime Investigation Service (FNTT)", channel: "https://www.fntt.lt" };

/** Lithuania: the AML supervisor depends on the sector. */
function ltSupervisor(sectors: string[]): Contact {
  if (sectors.includes("LEGAL")) return { name: "Lithuanian Bar Association (advocates) / Chamber of Notaries (notaries)", channel: "https://www.advokatura.lt" };
  if (sectors.includes("GAMBLING")) return { name: "Gaming Control Authority", channel: "https://lpt.lrv.lt" };
  if (sectors.includes("CROWDFUNDING") || sectors.includes("CREDIT_INTERMEDIARY")) return { name: "Bank of Lithuania", channel: "https://www.lb.lt" };
  return FNTT; // accountants, estate agents, traders, company service providers and others
}

const LT_HOLIDAYS = [
  "2026-01-01", "2026-02-16", "2026-03-11", "2026-04-05", "2026-04-06", "2026-05-01", "2026-05-03", "2026-06-07", "2026-06-24", "2026-07-06", "2026-08-15", "2026-11-01", "2026-11-02", "2026-12-24", "2026-12-25", "2026-12-26",
  "2027-01-01", "2027-02-16", "2027-03-11", "2027-03-28", "2027-03-29", "2027-05-01", "2027-05-02", "2027-06-06", "2027-06-24", "2027-07-06", "2027-08-15", "2027-11-01", "2027-11-02", "2027-12-24", "2027-12-25", "2027-12-26",
];

type Partial3 = Omit<NationalSuggestions, "supervisor" | "holidays">;
const c = (name: string, channel: string): Contact => ({ name, channel });

/**
 * Financial intelligence unit, data protection authority, beneficial-ownership register and (where known)
 * the national authority for financial sanctions, per EU country. Left out where we couldn't confirm it:
 * the firm fills those in itself. Supervisors depend on the profession and are suggested for Lithuania only.
 */
const EU_AUTHORITIES: Record<string, Partial3> = {
  AT: { fiu: c("A-FIU (Geldwäschemeldestelle, Bundeskriminalamt)", "https://www.bundeskriminalamt.at"), dataProtectionAuthority: c("Datenschutzbehörde", "https://www.dsb.gv.at"), boRegister: c("Register der wirtschaftlichen Eigentümer (Federal Ministry of Finance)", "https://www.bmf.gv.at"), sanctionsAuthority: c("Oesterreichische Nationalbank", "https://www.oenb.at") },
  BE: { fiu: c("CTIF-CFI", "https://www.ctif-cfi.be"), dataProtectionAuthority: c("Data Protection Authority (APD/GBA)", "https://www.dataprotectionauthority.be"), boRegister: c("UBO register (FPS Finance)", "https://finances.belgium.be"), sanctionsAuthority: c("FPS Finance, Treasury", "https://finances.belgium.be") },
  BG: { fiu: c("Financial Intelligence Directorate, State Agency for National Security", "https://www.dans.bg"), dataProtectionAuthority: c("Commission for Personal Data Protection", "https://www.cpdp.bg"), boRegister: c("Registry Agency (Commercial Register)", "https://www.registryagency.bg") },
  HR: { fiu: c("Anti-Money Laundering Office (Ured za sprječavanje pranja novca)", "https://www.mfin.gov.hr"), dataProtectionAuthority: c("Personal Data Protection Agency (AZOP)", "https://azop.hr"), boRegister: c("Register of Beneficial Owners (FINA)", "https://www.fina.hr") },
  CY: { fiu: c("MOKAS (Unit for Combating Money Laundering)", "https://www.law.gov.cy"), dataProtectionAuthority: c("Commissioner for Personal Data Protection", "https://www.dataprotection.gov.cy"), boRegister: c("Register of Beneficial Owners (Registrar of Companies)", "https://www.companies.gov.cy") },
  CZ: { fiu: c("Financial Analytical Office (FAÚ)", "https://www.fau.gov.cz"), dataProtectionAuthority: c("Office for Personal Data Protection (ÚOOÚ)", "https://uoou.gov.cz"), boRegister: c("Evidence skutečných majitelů (Ministry of Justice)", "https://esm.justice.cz"), sanctionsAuthority: c("Financial Analytical Office (FAÚ)", "https://www.fau.gov.cz") },
  DK: { fiu: c("Money Laundering Secretariat (Hvidvasksekretariatet), Danish Police", "https://politi.dk"), dataProtectionAuthority: c("Datatilsynet", "https://www.datatilsynet.dk"), boRegister: c("Danish Business Authority (CVR, beneficial owners)", "https://erhvervsstyrelsen.dk"), sanctionsAuthority: c("Danish Business Authority", "https://erhvervsstyrelsen.dk") },
  EE: { fiu: c("Financial Intelligence Unit (Rahapesu Andmebüroo)", "https://fiu.ee"), dataProtectionAuthority: c("Data Protection Inspectorate (AKI)", "https://www.aki.ee"), boRegister: c("e-Business Register (RIK)", "https://ariregister.rik.ee"), sanctionsAuthority: c("Financial Intelligence Unit", "https://fiu.ee") },
  FI: { fiu: c("Financial Intelligence Unit, National Bureau of Investigation", "https://poliisi.fi"), dataProtectionAuthority: c("Office of the Data Protection Ombudsman", "https://tietosuoja.fi"), boRegister: c("Finnish Patent and Registration Office (PRH)", "https://www.prh.fi"), sanctionsAuthority: c("National Enforcement Authority (Ulosottolaitos)", "https://ulosottolaitos.fi") },
  FR: { fiu: c("Tracfin", "https://www.economie.gouv.fr/tracfin"), dataProtectionAuthority: c("CNIL", "https://www.cnil.fr"), boRegister: c("Registre des bénéficiaires effectifs (INPI)", "https://www.inpi.fr"), sanctionsAuthority: c("Direction générale du Trésor", "https://www.tresor.economie.gouv.fr") },
  DE: { fiu: c("FIU (Zentralstelle für Finanztransaktionsuntersuchungen)", "https://www.fiu.bund.de"), dataProtectionAuthority: c("Data protection authority of your federal state (list at bfdi.bund.de)", "https://www.bfdi.bund.de"), boRegister: c("Transparenzregister", "https://www.transparenzregister.de"), sanctionsAuthority: c("Deutsche Bundesbank", "https://www.bundesbank.de") },
  GR: { fiu: c("Hellenic FIU (Anti-Money Laundering Authority)", "https://www.hellenic-fiu.gr"), dataProtectionAuthority: c("Hellenic Data Protection Authority", "https://www.dpa.gr") },
  HU: { fiu: c("Hungarian FIU (NAV Pénzmosás Elleni Információs Iroda)", "https://nav.gov.hu"), dataProtectionAuthority: c("NAIH", "https://naih.hu") },
  IE: { fiu: c("FIU Ireland (Garda National Economic Crime Bureau)", "https://www.fiu-ireland.ie"), dataProtectionAuthority: c("Data Protection Commission", "https://www.dataprotection.ie"), boRegister: c("Register of Beneficial Ownership (RBO)", "https://rbo.gov.ie"), sanctionsAuthority: c("Central Bank of Ireland", "https://www.centralbank.ie") },
  IT: { fiu: c("UIF (Unità di Informazione Finanziaria per l'Italia)", "https://uif.bancaditalia.it"), dataProtectionAuthority: c("Garante per la protezione dei dati personali", "https://www.garanteprivacy.it"), boRegister: c("Registro dei titolari effettivi (Registro delle Imprese)", "https://www.registroimprese.it"), sanctionsAuthority: c("UIF (freezing reports)", "https://uif.bancaditalia.it") },
  LV: { fiu: c("Financial Intelligence Service (FID)", "https://www.fid.gov.lv"), dataProtectionAuthority: c("Data State Inspectorate (DVI)", "https://www.dvi.gov.lv"), boRegister: c("Register of Enterprises", "https://www.ur.gov.lv"), sanctionsAuthority: c("Financial Intelligence Service (FID)", "https://www.fid.gov.lv") },
  LU: { fiu: c("Cellule de renseignement financier (CRF)", "https://justice.public.lu"), dataProtectionAuthority: c("CNPD", "https://cnpd.public.lu"), boRegister: c("Registre des bénéficiaires effectifs (LBR)", "https://www.lbr.lu"), sanctionsAuthority: c("Ministry of Finance", "https://mfin.gouvernement.lu") },
  MT: { fiu: c("FIAU (Financial Intelligence Analysis Unit)", "https://fiaumalta.org"), dataProtectionAuthority: c("Information and Data Protection Commissioner", "https://idpc.org.mt"), boRegister: c("Malta Business Registry", "https://mbr.mt") },
  NL: { fiu: c("FIU-the Netherlands", "https://www.fiu-nederland.nl"), dataProtectionAuthority: c("Autoriteit Persoonsgegevens", "https://autoriteitpersoonsgegevens.nl"), boRegister: c("UBO register (KVK)", "https://www.kvk.nl") },
  PL: { fiu: c("General Inspector of Financial Information (GIIF)", "https://www.gov.pl/web/finanse"), dataProtectionAuthority: c("UODO", "https://uodo.gov.pl"), boRegister: c("Central Register of Beneficial Owners (CRBR)", "https://crbr.podatki.gov.pl"), sanctionsAuthority: c("General Inspector of Financial Information (GIIF)", "https://www.gov.pl/web/finanse") },
  PT: { fiu: c("UIF (Financial Intelligence Unit, Polícia Judiciária)", "https://www.policiajudiciaria.pt"), dataProtectionAuthority: c("CNPD", "https://www.cnpd.pt"), boRegister: c("Registo Central do Beneficiário Efetivo (RCBE)", "https://rcbe.justica.gov.pt") },
  RO: { fiu: c("ONPCSB (National Office for Prevention and Control of Money Laundering)", "https://www.onpcsb.ro"), dataProtectionAuthority: c("ANSPDCP", "https://www.dataprotection.ro"), boRegister: c("National Trade Register Office (ONRC)", "https://www.onrc.ro") },
  SK: { fiu: c("Financial Intelligence Unit (FSJ), National Crime Agency", "https://www.minv.sk"), dataProtectionAuthority: c("Office for Personal Data Protection", "https://dataprotection.gov.sk") },
  SI: { fiu: c("Office for Money Laundering Prevention (UPPD)", "https://www.gov.si"), dataProtectionAuthority: c("Information Commissioner", "https://www.ip-rs.si"), boRegister: c("Register of Beneficial Owners (AJPES)", "https://www.ajpes.si") },
  ES: { fiu: c("SEPBLAC", "https://www.sepblac.es"), dataProtectionAuthority: c("AEPD", "https://www.aepd.es"), sanctionsAuthority: c("Secretaría General del Tesoro", "https://www.tesoro.es") },
  SE: { fiu: c("Financial Intelligence Unit (Finanspolisen), Swedish Police", "https://polisen.se"), dataProtectionAuthority: c("Integritetsskyddsmyndigheten (IMY)", "https://www.imy.se"), boRegister: c("Bolagsverket (register of beneficial owners)", "https://bolagsverket.se") },
};

export function nationalSuggestions(memberState: string, sectors: string[]): NationalSuggestions {
  if (memberState !== "LT") return EU_AUTHORITIES[memberState] ?? {};
  return {
    supervisor: ltSupervisor(sectors),
    fiu: { name: FNTT.name, channel: "https://www.fntt.lt (online reporting for obliged entities)" },
    sanctionsAuthority: { name: FNTT.name, channel: "https://www.fntt.lt" },
    boRegister: { name: "JANGIS, Centre of Registers (Registrų centras)", channel: "https://www.registrucentras.lt" },
    dataProtectionAuthority: { name: "State Data Protection Inspectorate", channel: "https://vdai.lrv.lt" },
    whistleblowing: "Prosecutor General's Office, https://www.prokuraturos.lt",
    holidays: LT_HOLIDAYS,
  };
}
