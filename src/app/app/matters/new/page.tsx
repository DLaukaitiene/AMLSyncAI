import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { ActionForm, Field, Submit } from "@/components/form";
import { createMatterAction } from "../actions";

const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";

export default async function NewMatterPage() {
  const s = await requireUser("client.edit");
  const firm = await withTenant(s.firm.id, (tx) => tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } }));
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">New matter</h1>
      <ActionForm action={createMatterAction}>
        <Field label="Title" name="title" required hint="e.g. Sale of Gedimino pr. 1-5, Vilnius" />
        <Field label="Type" name="type" required>
          <select name="type" className={sel} aria-label="Type" defaultValue={firm.sectors.includes("ESTATE_AGENT") ? "PROPERTY_SALE" : firm.sectors.includes("HVG_TRADER") ? "GOODS_SALE" : "ENGAGEMENT"}>
            <option value="ENGAGEMENT">Engagement (accountants, lawyers, TCSPs)</option>
            <option value="PROPERTY_SALE">Property sale — buyer and seller both need CDD</option>
            <option value="LETTING">Letting (rent ≥ €10,000/month) — landlord and tenant</option>
            <option value="GOODS_SALE">Sale of goods — customer and supplier need CDD</option>
            <option value="COMPANY_FORMATION">Company formation / transfer of ownership</option>
            <option value="TRANSACTION">Occasional transaction</option>
          </select>
        </Field>
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
          <Field label="Goods category" name="goodsCategory">
            <select name="goodsCategory" className={sel} aria-label="Goods category" defaultValue="">
              <option value="">—</option>
              <option value="jewellery-watches">Jewellery and watches</option>
              <option value="precious-metals-stones">Precious metals and stones</option>
              <option value="motor-vehicle">Motor vehicle</option>
              <option value="aircraft">Aircraft</option>
              <option value="watercraft">Watercraft</option>
              <option value="art">Art and cultural goods</option>
            </select>
          </Field>
        </div>
        <Submit>Create matter</Submit>
      </ActionForm>
    </div>
  );
}
