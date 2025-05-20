
import { Client, Rule } from './types';

// Drag and drop handlers
export const handleDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
};

export const handleDrop = (e: React.DragEvent, stageId: string) => {
  e.preventDefault();
  const clientId = e.dataTransfer.getData("clientId");
  return { clientId, stageId };
};

// Client tag handlers
export const handleAddTagToClient = (client: Client, tagId: string): Client => {
  if (!client.tags) {
    return { ...client, tags: [tagId] };
  }
  
  if (client.tags.includes(tagId)) {
    return client;
  }
  
  return {
    ...client,
    tags: [...client.tags, tagId]
  };
};

export const handleRemoveTagFromClient = (client: Client, tagId: string): Client => {
  if (!client.tags || !client.tags.includes(tagId)) {
    return client;
  }
  
  return {
    ...client,
    tags: client.tags.filter(id => id !== tagId)
  };
};

// Rules handlers
export const handleSaveRule = (rule: Rule): Rule => {
  console.log("Save rule:", rule);
  return rule;
};

export const handleRemoveRule = (ruleId: string) => {
  console.log("Remove rule:", ruleId);
};
