
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, X, FileUp, Plus, Tag, Users } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { Member } from "@/components/shared/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface NewProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (event: React.FormEvent, data: ProjectFormData) => void;
  availableMembers: Member[];
}

export interface ProjectFormData {
  name: string;
  description: string;
  dueDate?: Date;
  members: Member[];
  files: File[];
  tags: string[];
}

export function NewProjectDialog({
  open,
  onOpenChange,
  onSave,
  availableMembers
}: NewProjectDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Member[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(e, {
      name,
      description,
      dueDate: selectedDate,
      members: selectedMembers,
      files,
      tags
    });
    
    // Reset form
    setName("");
    setDescription("");
    setSelectedDate(undefined);
    setSelectedMembers([]);
    setFiles([]);
    setTags([]);
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setFiles(prev => [...prev, ...newFiles]);
    }
  };
  
  const removeFile = (fileToRemove: File) => {
    setFiles(files.filter(file => file !== fileToRemove));
  };
  
  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
    }
  };
  
  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };
  
  const toggleMember = (member: Member) => {
    if (selectedMembers.find(m => m.id === member.id)) {
      setSelectedMembers(selectedMembers.filter(m => m.id !== member.id));
    } else {
      setSelectedMembers([...selectedMembers, member]);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Novo Projeto</DialogTitle>
          <DialogDescription>
            Adicione as informações do novo projeto
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="projectName">Nome do Projeto</Label>
              <Input 
                id="projectName" 
                name="projectName" 
                placeholder="Nome do projeto" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                required 
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <RichTextEditor 
                value={description}
                onChange={setDescription}
                className="min-h-[150px]"
              />
            </div>
            
            <div className="grid gap-2">
              <Label>Data de Entrega</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "dd/MM/yyyy") : <span>Selecione uma data</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="grid gap-2">
              <Label>Colaboradores</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedMembers.map(member => (
                  <Badge key={member.id} variant="secondary" className="px-2 py-1 flex items-center gap-1">
                    <Avatar className="h-4 w-4">
                      <AvatarFallback className="text-[8px]">{member.avatar}</AvatarFallback>
                    </Avatar>
                    {member.name}
                    <button 
                      type="button" 
                      className="ml-1 hover:text-destructive" 
                      onClick={() => toggleMember(member)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <Users className="mr-2 h-4 w-4" />
                    Selecionar Colaboradores
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60">
                  <div className="grid gap-2 p-2">
                    {availableMembers.map(member => (
                      <div 
                        key={member.id} 
                        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted rounded-md"
                        onClick={() => toggleMember(member)}
                      >
                        <div className="flex-shrink-0">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{member.avatar}</AvatarFallback>
                          </Avatar>
                        </div>
                        <div className="flex-1">{member.name}</div>
                        {selectedMembers.find(m => m.id === member.id) && (
                          <div className="w-4 h-4 bg-primary rounded-full"></div>
                        )}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="grid gap-2">
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="px-2 py-1">
                    {tag}
                    <button 
                      type="button" 
                      className="ml-1 hover:text-destructive" 
                      onClick={() => removeTag(tag)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input 
                  placeholder="Adicionar tag" 
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTag.trim()) {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  className="flex-1"
                />
                <Button 
                  type="button" 
                  variant="secondary" 
                  onClick={addTag}
                  disabled={!newTag.trim() || tags.includes(newTag.trim())}
                >
                  <Tag className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="grid gap-2">
              <Label>Arquivos</Label>
              <div className="flex flex-col gap-2 mb-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded-md">
                    <div className="flex items-center">
                      <FileUp className="h-4 w-4 mr-2 text-muted-foreground" />
                      <span className="text-sm">{file.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <Button 
                      type="button" 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => removeFile(file)}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center p-6 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  multiple
                  onChange={handleFileChange}
                />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
                  <FileUp className="h-8 w-8 mb-2 text-muted-foreground" />
                  <span className="text-sm font-medium">Arraste arquivos aqui ou clique para selecionar</span>
                  <span className="text-xs text-muted-foreground mt-1">Suporta qualquer tipo de arquivo até 10MB</span>
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">Criar Projeto</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
