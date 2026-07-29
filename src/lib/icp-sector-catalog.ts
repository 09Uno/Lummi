/**
 * Catálogo tipado de ICP (Ideal Customer Profile): macrosetores e
 * microsetores, com grupos CNAE 2.0 relacionados e descrição comercial B2B.
 *
 * Substitui a lista simples anterior em prospeccao.tsx. Quando não há
 * segurança sobre o código CNAE exato de um microsetor amplo, o campo
 * `cnaeGroups` usa faixas/grupos genéricos e `cnaeToValidar` fica `true`
 * para sinalizar que a granularidade fina deve ser validada antes de uso
 * em filtros críticos (ex.: consulta a bases externas por CNAE exato).
 */

export type IcpMicroSector = {
  /** slug estável — usado como valor em filtros/URLs/localStorage */
  id: string;
  label: string;
  /** grupos/intervalos CNAE 2.0 relacionados (divisão ou grupo, não subclasse fina) */
  cnaeGroups: string[];
  /** true = grupos acima são referência ampla, validar subclasse exata antes de uso crítico */
  cnaeToValidar?: boolean;
  /** descrição comercial B2B curta: por que esse microsetor importa para prospecção */
  description: string;
  /** prioridade relativa dentro do macrosetor (1 = mais prioritário) */
  priority?: number;
};

export type IcpMacroSector = {
  id: string;
  label: string;
  microSectors: IcpMicroSector[];
};

export const ICP_SECTOR_CATALOG: IcpMacroSector[] = [
  {
    id: "mineracao_extrativa",
    label: "Mineração e Indústrias Extrativas",
    microSectors: [
      {
        id: "mineracao_metalica",
        label: "Mineração de Minerais Metálicos",
        cnaeGroups: ["05 (Extração de carvão)", "07 (Extração de minerais metálicos)"],
        description:
          "Operações de grande porte, forte demanda por EPI, automação industrial, segurança do trabalho e serviços de facilities.",
        priority: 1,
      },
      {
        id: "mineracao_nao_metalica",
        label: "Extração de Minerais Não Metálicos",
        cnaeGroups: ["08 (Extração de minerais não metálicos)"],
        description:
          "Pedreiras, areia, brita. Demanda manutenção industrial, logística pesada e segurança.",
        priority: 2,
      },
      {
        id: "petroleo_gas_upstream",
        label: "Petróleo e Gás — Upstream",
        cnaeGroups: ["06 (Extração de petróleo e gás natural)"],
        description:
          "Exploração e produção. Ciclos de compra longos, forte compliance/HSE, fornecedores homologados.",
        priority: 1,
      },
      {
        id: "servicos_apoio_extracao",
        label: "Serviços de Apoio à Extração",
        cnaeGroups: ["09 (Atividades de apoio à extração de minerais)"],
        description: "Terceirizadas técnicas que atendem mineradoras e petrolíferas diretamente.",
        priority: 3,
      },
    ],
  },
  {
    id: "saude",
    label: "Saúde",
    microSectors: [
      {
        id: "redes_farmacias",
        label: "Redes de Farmácias",
        cnaeGroups: ["47.71 (Comércio varejista de produtos farmacêuticos)"],
        description:
          "Redes com múltiplas filiais — decisão centralizada em matriz, forte apelo a eficiência operacional e compliance regulatório (Anvisa).",
        priority: 1,
      },
      {
        id: "laboratorios_analises",
        label: "Laboratórios de Análises Clínicas",
        cnaeGroups: ["86.40-2 (Atividades de laboratórios clínicos)"],
        description:
          "Alta demanda por sistemas de gestão, rastreabilidade de amostras e integração com convênios.",
        priority: 1,
      },
      {
        id: "hospitais_clinicas",
        label: "Hospitais e Clínicas",
        cnaeGroups: [
          "86.1 (Atividades de atendimento hospitalar)",
          "86.2 (Serviços móveis de atendimento a urgências e clínicas)",
        ],
        description:
          "Ciclo de compra mais longo, decisão colegiada (diretoria clínica + administrativa).",
        priority: 2,
      },
      {
        id: "distribuidoras_farmaceuticas",
        label: "Distribuidoras e Indústria Farmacêutica",
        cnaeGroups: [
          "21 (Fabricação de produtos farmoquímicos e farmacêuticos)",
          "46.44 (Comércio atacadista de medicamentos)",
        ],
        description:
          "Fornecedores da cadeia — forte necessidade de compliance, logística e rastreabilidade.",
        priority: 2,
      },
    ],
  },
  {
    id: "industria",
    label: "Indústria",
    microSectors: [
      {
        id: "quimica",
        label: "Química",
        cnaeGroups: ["20 (Fabricação de produtos químicos)"],
        description:
          "Processos contínuos, forte foco em segurança, meio ambiente e eficiência energética.",
        priority: 1,
      },
      {
        id: "petroquimica",
        label: "Petroquímica",
        cnaeGroups: [
          "19.2 (Fabricação de produtos derivados do petróleo)",
          "20.1 (Fabricação de químicos inorgânicos/orgânicos)",
        ],
        cnaeToValidar: true,
        description: "Grandes plantas, decisão técnica + industrial, ciclos de venda longos.",
        priority: 1,
      },
      {
        id: "celulose_papel",
        label: "Celulose e Papel",
        cnaeGroups: ["17 (Fabricação de celulose, papel e produtos de papel)"],
        description:
          "Operações florestais + industriais; forte pauta de sustentabilidade e eficiência operacional.",
        priority: 2,
      },
      {
        id: "autopecas",
        label: "Autopeças",
        cnaeGroups: ["29.3 (Fabricação de peças e acessórios para veículos automotores)"],
        description:
          "Fornecedores de montadoras, exigência de qualidade (IATF) e eficiência de manufatura.",
        priority: 2,
      },
      {
        id: "metalmecanica",
        label: "Metalmecânica",
        cnaeGroups: ["24 (Metalurgia)", "25 (Fabricação de produtos de metal)"],
        description:
          "Manufatura sob encomenda ou seriada; demanda automação e manutenção industrial.",
        priority: 3,
      },
    ],
  },
  {
    id: "facilities_seguranca",
    label: "Facilities e Segurança",
    microSectors: [
      {
        id: "facilities_gerais",
        label: "Facilities (Gestão Predial)",
        cnaeGroups: ["81 (Serviços para edifícios e atividades paisagísticas)"],
        description:
          "Empresas que administram operação predial de terceiros — bom canal indireto de prospecção B2B2B.",
        priority: 2,
      },
      {
        id: "seguranca_privada",
        label: "Segurança Privada",
        cnaeGroups: ["80 (Atividades de vigilância, segurança e investigação)"],
        description:
          "Forte regulação (Polícia Federal), operação intensiva em mão de obra, foco em compliance e gestão de escalas.",
        priority: 2,
      },
      {
        id: "limpeza_conservacao",
        label: "Limpeza e Conservação",
        cnaeGroups: ["81.2 (Atividades de limpeza)"],
        description:
          "Terceirização intensiva em mão de obra, forte demanda por gestão de contratos e produtividade.",
        priority: 3,
      },
    ],
  },
  {
    id: "comercio_veiculos",
    label: "Comércio de Veículos",
    microSectors: [
      {
        id: "concessionarias",
        label: "Concessionárias de Veículos",
        cnaeGroups: ["45.1 (Comércio de veículos automotores)"],
        description:
          "Multimarcas ou monomarcas; decisão em diretoria comercial/pós-venda, ciclos de venda mais rápidos.",
        priority: 2,
      },
      {
        id: "revendas_autopecas",
        label: "Revenda de Autopeças",
        cnaeGroups: ["45.3 (Comércio de peças e acessórios para veículos)"],
        description:
          "Redes de revenda com múltiplas lojas; oportunidade de sistemas de gestão multiloja.",
        priority: 3,
      },
    ],
  },
  {
    id: "agronegocio",
    label: "Agronegócio",
    microSectors: [
      {
        id: "producao_agricola",
        label: "Produção Agrícola",
        cnaeGroups: [
          "01.1 (Produção de lavouras temporárias)",
          "01.2 (Horticultura e lavouras permanentes)",
        ],
        description:
          "Grandes propriedades e cooperativas; sazonalidade forte, decisão em gestão de fazenda.",
        priority: 2,
      },
      {
        id: "agroindustria",
        label: "Agroindústria e Processamento",
        cnaeGroups: ["10 (Fabricação de produtos alimentícios)"],
        description:
          "Processamento e beneficiamento; forte pauta de rastreabilidade e certificação.",
        priority: 2,
      },
      {
        id: "insumos_agricolas",
        label: "Insumos e Defensivos Agrícolas",
        cnaeGroups: ["20.1 (Fabricação de defensivos agrícolas e químicos)"],
        cnaeToValidar: true,
        description: "Distribuidoras e fabricantes de insumos; ciclo sazonal atrelado a safras.",
        priority: 3,
      },
    ],
  },
  {
    id: "varejo",
    label: "Varejo",
    microSectors: [
      {
        id: "varejo_alimentar",
        label: "Varejo Alimentar / Supermercados",
        cnaeGroups: ["47.1 (Comércio varejista não especializado)"],
        description: "Redes com múltiplas lojas; forte foco em logística, PDV e gestão de estoque.",
        priority: 2,
      },
      {
        id: "varejo_moda",
        label: "Varejo de Moda e Vestuário",
        cnaeGroups: ["47.81 (Comércio varejista de artigos do vestuário)"],
        description: "Redes de lojas físicas + e-commerce; forte demanda por omnichannel.",
        priority: 3,
      },
      {
        id: "ecommerce",
        label: "E-commerce",
        cnaeGroups: ["47.9 (Comércio varejista não realizado em loja)"],
        description:
          "Operação digital-first; forte demanda por automação de marketing e logística.",
        priority: 2,
      },
    ],
  },
  {
    id: "servicos",
    label: "Serviços",
    microSectors: [
      {
        id: "agencias_marketing",
        label: "Agências de Marketing e Publicidade",
        cnaeGroups: ["73.1 (Publicidade)"],
        description:
          "Decisão em marketing/growth; ciclo de venda mais curto, forte apelo a performance e ROI.",
        priority: 2,
      },
      {
        id: "consultoria_empresarial",
        label: "Consultoria Empresarial",
        cnaeGroups: ["70.2 (Atividades de consultoria em gestão empresarial)"],
        description: "Decisão em sócios/diretoria; venda consultiva, ciclo médio.",
        priority: 3,
      },
      {
        id: "servicos_juridicos_contabeis",
        label: "Escritórios Jurídicos e Contábeis",
        cnaeGroups: ["69 (Atividades jurídicas, de contabilidade e de auditoria)"],
        description: "Operação baseada em conhecimento; demanda gestão de processos e compliance.",
        priority: 3,
      },
    ],
  },
  {
    id: "energia",
    label: "Energia",
    microSectors: [
      {
        id: "geracao_distribuicao_energia",
        label: "Geração e Distribuição de Energia",
        cnaeGroups: ["35 (Eletricidade, gás e outras utilidades)"],
        description: "Setor regulado, ciclos de compra longos, forte compliance (ANEEL).",
        priority: 2,
      },
      {
        id: "energia_renovavel",
        label: "Energia Renovável (Solar/Eólica)",
        cnaeGroups: ["35.1 (Geração de energia elétrica)"],
        cnaeToValidar: true,
        description:
          "Setor em expansão, decisão técnica + financeira, forte demanda por eficiência de projeto.",
        priority: 2,
      },
    ],
  },
  {
    id: "tecnologia",
    label: "Tecnologia",
    microSectors: [
      {
        id: "software_saas",
        label: "Software e SaaS",
        cnaeGroups: ["62 (Atividades dos serviços de tecnologia da informação)"],
        description:
          "Decisão em produto/tecnologia; ciclo de venda curto a médio, forte apelo a integração e escalabilidade.",
        priority: 2,
      },
      {
        id: "ti_infraestrutura",
        label: "TI e Infraestrutura",
        cnaeGroups: ["63 (Atividades de prestação de serviços de informação)"],
        description: "Empresas de infraestrutura/cloud/dados; decisão técnica em TI.",
        priority: 3,
      },
    ],
  },
  {
    id: "educacao",
    label: "Educação",
    microSectors: [
      {
        id: "ensino_superior",
        label: "Ensino Superior",
        cnaeGroups: ["85.3 (Educação superior)"],
        description: "Decisão institucional (reitoria/mantenedora); ciclo de compra longo.",
        priority: 3,
      },
      {
        id: "ensino_basico_tecnico",
        label: "Ensino Básico e Técnico",
        cnaeGroups: ["85.1 (Educação infantil e ensino fundamental)", "85.2 (Ensino médio)"],
        description:
          "Redes de escolas; decisão em mantenedora/diretoria pedagógica-administrativa.",
        priority: 3,
      },
    ],
  },
  {
    id: "entretenimento",
    label: "Entretenimento",
    microSectors: [
      {
        id: "eventos_producao",
        label: "Eventos e Produção Cultural",
        cnaeGroups: ["90 (Atividades artísticas, criativas e de espetáculos)"],
        description: "Operação por projeto; decisão em produção/diretoria de eventos.",
        priority: 4,
      },
      {
        id: "parques_lazer",
        label: "Parques e Atividades de Lazer",
        cnaeGroups: ["93 (Atividades esportivas e de recreação e lazer)"],
        description: "Operação com forte sazonalidade e demanda por gestão de bilheteria/ocupação.",
        priority: 4,
      },
    ],
  },
];

/** Índice plano de todos os microsetores, útil para busca/lookup rápido. */
export const ICP_MICRO_SECTOR_INDEX: Record<
  string,
  { macro: IcpMacroSector; micro: IcpMicroSector }
> = ICP_SECTOR_CATALOG.reduce(
  (acc, macro) => {
    for (const micro of macro.microSectors) {
      acc[micro.id] = { macro, micro };
    }
    return acc;
  },
  {} as Record<string, { macro: IcpMacroSector; micro: IcpMicroSector }>,
);

export function findMicroSector(id: string) {
  return ICP_MICRO_SECTOR_INDEX[id] ?? null;
}

export function listMacroSectorLabels(): { id: string; label: string }[] {
  return ICP_SECTOR_CATALOG.map((m) => ({ id: m.id, label: m.label }));
}
