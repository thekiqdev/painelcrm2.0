import { Member } from "@/components/shared/types";
import { Project } from "@/components/projects/types";

export const mockMembers: Member[] = [
  {
    id: "m1",
    name: "João Silva",
    email: "joao.silva@example.com",
    avatar: "https://utfs.io/f/c9a334bb-c989-4490-8f7f-5552aef9f7db-m92xjn.png"
  },
  {
    id: "m2",
    name: "Maria Oliveira",
    email: "maria.oliveira@example.com",
    avatar: "https://utfs.io/f/414ff4ff-c988-449b-94a2-41b9c654299a-1v9jue.png"
  },
  {
    id: "m3",
    name: "Carlos Pereira",
    email: "carlos.pereira@example.com",
    avatar: "https://utfs.io/f/16674979-c98a-4a1d-a919-49347498a954-zl09ke.png"
  },
  {
    id: "m4",
    name: "Ana Rodrigues",
    email: "ana.rodrigues@example.com",
    avatar: "https://utfs.io/f/35941994-c98a-4a4d-8e93-16a998935ca9-i6wg9j.png"
  }
];

// Update initialProjects to include financeItems
export const initialProjects: Partial<Project>[] = [
  {
    id: "p1",
    name: "Website Redesign",
    description: "Complete redesign of the company website with a focus on user experience and modern design principles.",
    status: "active",
    dueDate: "2023-06-15",
    members: [
      mockMembers[0],
      mockMembers[1],
      mockMembers[2]
    ],
    tags: ["design", "development", "high-priority"],
    lists: [
      {
        id: "l1",
        name: "A Fazer",
        tasks: [
          {
            id: "t1",
            title: "Criar wireframes das páginas principais",
            description: "Desenvolver wireframes para a página inicial, sobre nós e contato.",
            status: "todo",
            priority: "high",
            assignee: mockMembers[1]
          },
          {
            id: "t2",
            title: "Definir paleta de cores",
            description: "Escolher uma paleta de cores que reflita a identidade da marca.",
            status: "todo",
            priority: "medium"
          }
        ],
        order: 0
      },
      {
        id: "l2",
        name: "Em Andamento",
        tasks: [
          {
            id: "t3",
            title: "Pesquisa de usuário",
            description: "Conduzir entrevistas com 10 usuários para entender suas necessidades.",
            status: "in-progress",
            priority: "high",
            assignee: mockMembers[0],
            dueDate: "2023-05-20"
          }
        ],
        order: 1
      },
      {
        id: "l3",
        name: "Revisão",
        tasks: [],
        order: 2
      },
      {
        id: "l4",
        name: "Concluídos",
        tasks: [
          {
            id: "t4",
            title: "Análise do site atual",
            description: "Identificar pontos fortes e fracos do site existente.",
            status: "completed",
            priority: "high",
            assignee: mockMembers[2]
          }
        ],
        order: 3
      }
    ],
    financeItems: []
  },
  {
    id: "p2",
    name: "Aplicativo Mobile",
    description: "Desenvolvimento de um aplicativo mobile para clientes acessarem nossos serviços.",
    status: "active",
    members: [
      mockMembers[1],
      mockMembers[3]
    ],
    tags: ["mobile", "development"],
    lists: [
      {
        id: "l5",
        name: "A Fazer",
        tasks: [
          {
            id: "t5",
            title: "Design de telas",
            description: "Criar designs para todas as telas principais do aplicativo.",
            status: "todo",
            priority: "high",
          }
        ],
        order: 0
      },
      {
        id: "l6",
        name: "Em Andamento",
        tasks: [],
        order: 1
      },
      {
        id: "l7",
        name: "Revisão",
        tasks: [],
        order: 2
      },
      {
        id: "l8",
        name: "Concluídos",
        tasks: [],
        order: 3
      }
    ],
    financeItems: []
  },
];
