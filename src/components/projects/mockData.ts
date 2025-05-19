
import { Project, ProjectFile, ProjectFinanceItem } from "./types";
import { Member } from "../shared/types";

// Mock members
export const mockMembers: Member[] = [
  { id: "m1", name: "Alex Silva", avatar: "AS" },
  { id: "m2", name: "Maria Oliveira", avatar: "MO" },
  { id: "m3", name: "João Santos", avatar: "JS" }
];

// Mock files
export const mockFiles: ProjectFile[] = [
  {
    id: "f1",
    name: "projeto-wireframe.pdf",
    type: "pdf",
    size: "2.4 MB",
    uploadedBy: mockMembers[0],
    uploadedAt: "2025-05-10",
    url: "#"
  },
  {
    id: "f2",
    name: "design-mockup.psd",
    type: "psd",
    size: "8.1 MB",
    uploadedBy: mockMembers[1],
    uploadedAt: "2025-05-12",
    url: "#"
  },
  {
    id: "f3",
    name: "contrato-cliente.docx",
    type: "docx",
    size: "1.2 MB",
    uploadedBy: mockMembers[2],
    uploadedAt: "2025-05-15",
    url: "#"
  }
];

// Mock finance items
export const mockFinanceItems: ProjectFinanceItem[] = [
  {
    id: "fin1",
    description: "Pagamento inicial",
    amount: 5000,
    type: "income",
    date: "2025-05-05",
    status: "paid",
    category: "Faturamento"
  },
  {
    id: "fin2",
    description: "Licença de software",
    amount: 350,
    type: "expense",
    date: "2025-05-10",
    status: "paid",
    category: "Ferramentas"
  },
  {
    id: "fin3",
    description: "Segunda parcela",
    amount: 3500,
    type: "income",
    date: "2025-06-10",
    status: "pending",
    category: "Faturamento"
  }
];

// Initial projects data
export const initialProjects: Project[] = [
  {
    id: "p1",
    name: "Redesenho do Site",
    description: "Atualização completa do design e da funcionalidade do site corporativo",
    status: "active",
    dueDate: "2025-06-30",
    members: [mockMembers[0], mockMembers[1]],
    lists: [
      {
        id: "l1",
        name: "A Fazer",
        order: 0,
        tasks: [
          {
            id: "t1",
            title: "Wireframes para homepage",
            description: "Criar wireframes para a nova homepage",
            status: "todo",
            priority: "high",
            dueDate: "2025-05-25",
            assignee: mockMembers[1],
            labels: ["Design", "Frontend"],
            tags: ["Design", "Homepage"],
            checklist: [
              { id: "cl1", text: "Definir layout principal", completed: false },
              { id: "cl2", text: "Criar mockup mobile", completed: true },
              { id: "cl3", text: "Revisar com cliente", completed: false }
            ]
          },
          {
            id: "t2",
            title: "Estrutura de navegação",
            description: "Definir nova estrutura de navegação do site",
            status: "todo",
            priority: "medium",
            dueDate: "2025-05-23",
            assignee: mockMembers[0],
            labels: ["UX"],
            tags: ["UX", "Navegação"],
            checklist: [
              { id: "cl4", text: "Mapear páginas atuais", completed: true },
              { id: "cl5", text: "Propor nova hierarquia", completed: false }
            ]
          },
        ]
      },
      {
        id: "l2",
        name: "Em Andamento",
        order: 1,
        tasks: [
          {
            id: "t3",
            title: "Design do formulário de contato",
            description: "Implementar design responsivo para o formulário",
            status: "in-progress",
            priority: "medium",
            dueDate: "2025-05-20",
            assignee: mockMembers[1],
            labels: ["Design", "Form"],
            tags: ["Design", "Formulário"],
          }
        ]
      },
      {
        id: "l3",
        name: "Revisão",
        order: 2,
        tasks: [
          {
            id: "t4",
            title: "Paleta de cores",
            description: "Finalizar paleta de cores para o novo site",
            status: "review",
            priority: "low",
            assignee: mockMembers[2],
            labels: ["Design"],
            tags: ["Design", "Cores"],
          }
        ]
      },
      {
        id: "l4",
        name: "Concluídos",
        order: 3,
        tasks: [
          {
            id: "t5",
            title: "Benchmark concorrentes",
            description: "Análise dos sites dos concorrentes",
            status: "completed",
            priority: "high",
            assignee: mockMembers[0],
            labels: ["Research"],
            tags: ["Pesquisa", "Concorrentes"],
          }
        ]
      }
    ],
    files: mockFiles,
    financeItems: mockFinanceItems
  },
  {
    id: "p2",
    name: "Campanha Marketing Q2",
    description: "Planejamento e execução da campanha de marketing do segundo trimestre",
    status: "active",
    dueDate: "2025-07-15",
    members: [mockMembers[1], mockMembers[2]],
    lists: [
      {
        id: "l5",
        name: "A Fazer",
        order: 0,
        tasks: [
          {
            id: "t6",
            title: "Definir canais",
            description: "Selecionar canais de marketing para a campanha",
            status: "todo",
            priority: "high",
            dueDate: "2025-05-24",
            assignee: mockMembers[2],
            labels: ["Planejamento"],
            tags: ["Canais", "Planejamento"],
          }
        ]
      },
      {
        id: "l6",
        name: "Em Andamento",
        order: 1,
        tasks: [
          {
            id: "t7",
            title: "Criar conteúdo",
            description: "Desenvolver conteúdo para redes sociais",
            status: "in-progress",
            priority: "medium",
            dueDate: "2025-05-28",
            assignee: mockMembers[1],
            labels: ["Conteúdo"],
            tags: ["Conteúdo", "Social Media"],
          }
        ]
      },
      {
        id: "l7",
        name: "Revisão",
        order: 2,
        tasks: []
      },
      {
        id: "l8",
        name: "Concluídos",
        order: 3,
        tasks: []
      }
    ],
    files: [],
    financeItems: []
  }
];
