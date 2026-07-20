import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const TIERS: Array<[number, number, number]> = [
  [0, 50, 250],
  [51, 100, 500],
  [101, 200, 750],
  [201, 300, 1000],
  [301, 400, 1100],
  [401, 500, 1200],
  [501, 700, 1300],
  [701, 900, 1400],
  [901, 1100, 1500],
  [1101, 1300, 1600],
  [1301, 1500, 1700],
  [1501, 1700, 1800],
  [1701, 1900, 1900],
  [1901, 2100, 2000],
  [2101, 2300, 2100],
  [2301, 2500, 2200],
  [2501, 2700, 2300],
  [2701, 2900, 2400],
  [2901, 3100, 2500],
  [3101, 3300, 2600],
  [3301, 3500, 2700],
  [3501, 3700, 2800],
  [3701, 3900, 2900],
  [3901, 4100, 3000],
  [4101, 4300, 3100],
  [4301, 4500, 3200],
  [4501, 4700, 3300],
  [4701, 4900, 3400],
  [4901, 5100, 3500],
  [5101, 5400, 3600],
  [5401, 5700, 3700],
  [5701, 6000, 3800],
  [6001, 6300, 3900],
  [6301, 6600, 4000],
  [6601, 6900, 4100],
  [6901, 7200, 4200],
  [7201, 7500, 4300],
  [7501, 7800, 4400],
  [7801, 8100, 4500],
  [8101, 8400, 4600],
  [8401, 8700, 4700],
  [8701, 9000, 4800],
  [9001, 9300, 4900],
];

function parseEmployees(raw: string): number {
  const groups = raw.match(/\d[\d.]*/g) ?? [];
  const nums = groups.map((g) => parseInt(g.replace(/\./g, ""), 10)).filter((n) => !isNaN(n));
  if (!nums.length) return 0;
  return Math.max(...nums);
}

function getMonthlyFee(count: number): number {
  for (const [min, max, fee] of TIERS) {
    if (count >= min && count <= max) return fee;
  }
  return 5000;
}

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export function InvestmentSimulation({ employees }: { employees: string }) {
  const count = parseEmployees(employees);
  const monthly = getMonthlyFee(count);
  const perEmployeeMonth = count > 0 ? monthly / count : 0;
  const perEmployeeYear = perEmployeeMonth * 12;
  const yearlyTotal = monthly * 12;

  return (
    <section className="bg-card rounded-3xl p-6 border border-border shadow-card-soft">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-xl bg-primary text-primary-foreground">
          <Wallet className="w-5 h-5" />
        </div>
        <div>
          <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground">
            Simulação de Investimento
          </h3>
          <p className="text-sm text-foreground font-semibold">
            Plano EduHub para {count.toLocaleString("pt-BR")} colaboradores
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Funcionários" value={count.toLocaleString("pt-BR")} />
        <StatCard label="Mensalidade EduHub" value={brl(monthly)} />
        <StatCard label="Custo / Func. / Mês" value={brl(perEmployeeMonth)} highlight />
        <StatCard label="Custo / Func. / Ano" value={brl(perEmployeeYear)} highlight />
        <StatCard label="Investimento Anual" value={brl(yearlyTotal)} />
      </div>

      <p className="mt-6 text-xs text-muted-foreground text-center italic">
        Valores calculados automaticamente com base no número de colaboradores identificados.
      </p>
    </section>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4 border-l-4 bg-secondary/40 border border-border flex flex-col gap-1.5",
        highlight ? "border-l-[oklch(0.55_0.22_340)]" : "border-l-foreground",
      )}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="text-lg font-extrabold text-foreground">{value}</div>
    </div>
  );
}
