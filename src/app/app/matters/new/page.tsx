import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { ActionForm, Field, SelectWithOther, Submit } from "@/components/form";
import { createMatterAction } from "../actions";

const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";

export default async function NewMatterPage() {
  const s = await requireUser("client.edit");
  const { firm, offices } = await withTenant(s.firm.id, async (tx) => ({
    firm: await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } }),
    offices: await tx.office.findMany({ where: { isHome: false } }),
  }));
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl">New case</h1>
      <ActionForm action={createMatterAction}>
        <Field label="Title" name="title" required hint="e.g. Sale of Gedimino pr. 1-5, Vilnius" />
        <SelectWithOther
          label="Type"
          name="type"
          required
          defaultValue={firm.sectors.includes("ESTATE_AGENT") ? "PROPERTY_SALE" : firm.sectors.includes("HVG_TRADER") ? "GOODS_SALE" : "ENGAGEMENT"}
          options={[
            ["ENGAGEMENT", "Engagement (accountants, lawyers, TCSPs)"],
            ["PROPERTY_SALE", "Property sale — buyer and seller both need CDD"],
            ["LETTING", "Letting (rent ≥ €10,000/month) — landlord and tenant"],
            ["GOODS_SALE", "Sale of goods — customer and supplier need CDD"],
            ["COMPANY_FORMATION", "Company formation / transfer of ownership"],
            ["TRANSACTION", "Occasional transaction"],
          ]}
          otherLabel="Other (describe) — the client needs CDD"
        />
        {offices.length > 0 && (
          <Field label="Office" name="officeId">
            <select name="officeId" className={sel} aria-label="Office" defaultValue="">
              <option value="">Head office ({firm.homeState})</option>
              {offices.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.memberState})</option>)}
            </select>
          </Field>
        )}
        {firm.sectors.length > 1 && (
          <Field label="Sector" name="sector">
            <select name="sector" className={sel} aria-label="Sector">{firm.sectors.map((x) => <option key={x} value={x}>{x}</option>)}</select>
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Engagement type" name="engagementType" hint="Accountants: e.g. bookkeeping, audit, tax" />
          <Field label="Property address" name="property" />
          <Field label="Price (EUR)" name="price" type="number" />
          <Field label="Financing" name="financing" hint="e.g. mortgage, own funds" />
          <Field label="Item" name="item" hint="High-value goods" />
          <SelectWithOther
            label="Goods category"
            name="goodsCategory"
            placeholder="—"
            otherValue="other"
            options={[
              ["jewellery-watches", "Jewellery and watches"],
              ["precious-metals-stones", "Precious metals and stones"],
              ["motor-vehicle", "Motor vehicle"],
              ["aircraft", "Aircraft"],
              ["watercraft", "Watercraft"],
              ["art", "Art and cultural goods"],
            ]}
          />
        </div>
        <Submit>Create case</Submit>
      </ActionForm>
    </div>
  );
}
