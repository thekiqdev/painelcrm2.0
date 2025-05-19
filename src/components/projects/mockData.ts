
import { Project, ProjectFile, ProjectFinanceItem } from "./types";
import { Member } from "@/components/shared/types";

export const mockMembers: Member[] = [
  { id: "m1", name: "Alex Silva", avatar: "AS" },
  { id: "m2", name: "Maria Oliveira", avatar: "MO" },
  { id: "m3", name: "João Santos", avatar: "JS" }
];

export const mockFiles: ProjectFile[] = [
  {
    id: "f1",
    name: "proposta_comercial.pdf",
    type: "application/pdf",
    size: "125 KB",
    uploadedBy: mockMembers[0],
    uploadedAt: "2025-05-10T14:30:00Z",
    url: "#"
  },
  {
    id: "f2",
    name: "cronograma.xlsx",
    type: "application/excel",
    size: "78 KB",
    uploadedBy: mockMembers[1],
    uploadedAt: "2025-05-12T10:15:00Z",
    url: "#"
  }
];

export const mockFinanceItems: ProjectFinanceItem[] = [
  {
    id: "fi1",
    description: "Pagamento inicial",
    amount: 2500,
    type: "income",
    date: "2025-05-15",
    status: "paid"
  },
  {
    id: "fi2",
    description: "Licenças de software",
    amount: 350,
    type: "expense",
    date: "2025-05-20",
    status: "pending"
  }
];

export const initialProjects: Project[] = [
  {
    id: "p1",
    name: "Redesenho do Site",
    description: "Atualização completa do design e da funcionalidade do site corporativo",
    status: "active",
    dueDate: "2025-06-30",
    members: [mockMembers[0], mockMembers[1]],
    tags: ["Design", "Web", "Frontend"],
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
        tasks: []
      },
      {
        id: "l4",
        name: "Concluídos",
        order: 3,
        tasks: [
          {
            id: "t4",
            title: "Pesquisa de mercado",
            description: "Análise de concorrentes e referências",
            status: "completed",
            priority: "low",
            dueDate: "2025-05-10",
            assignee: mockMembers[2],
            tags: ["Pesquisa", "Análise"],
          }
        ]
      }
    ],
    files: mockFiles,
    financeItems: mockFinanceItems
  },
  {
    id: "p2",
    name: "Aplicativo Mobile",
    description: "Desenvolvimento de um aplicativo móvel para clientes",
    status: "active",
    dueDate: "2025-07-15",
    members: [mockMembers[0], mockMembers[2]],
    tags: ["Mobile", "App", "React Native"],
    lists: [
      {
        id: "l5",
        name: "A Fazer",
        order: 0,
        tasks: [
          {
            id: "t5",
            title: "Protótipos de telas",
            description: "Criar protótipos para as principais telas do app",
            status: "todo",
            priority: "high",
            dueDate: "2025-05-22",
            assignee: mockMembers[0],
            tags: ["Design", "UI/UX"],
          }
        ]
      },
      {
        id: "l6",
        name: "Em Andamento",
        order: 1,
        tasks: []
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
