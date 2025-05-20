
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, PlusCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

type Rule = {
  id: string;
  type: "date" | "status" | "source";
  operator: string;
  value: string | Date;
};

interface RuleFormProps {
  leadStatuses: Array<{ id: string; name: string; color: string }>;
  sourcesOptions: string[];
  onSaveRule: (rule: Rule) => void;
  existingRules: Rule[];
  onRemoveRule: (id: string) => void;
}

const RuleForm: React.FC<RuleFormProps> = ({
  leadStatuses,
  sourcesOptions,
  onSaveRule,
  existingRules,
  onRemoveRule
}) => {
  const [ruleType, setRuleType] = useState<"date" | "status" | "source">("date");
  const [operator, setOperator] = useState("equals");
  const [value, setValue] = useState<string | Date>("");
  const [dateValue, setDateValue] = useState<Date | undefined>(undefined);

  const handleAddRule = () => {
    if (ruleType === "date" && !dateValue) return;
    if ((ruleType === "status" || ruleType === "source") && !value) return;

    const newRule: Rule = {
      id: `rule-${Date.now()}`,
      type: ruleType,
      operator: operator,
      value: ruleType === "date" ? dateValue as Date : value
    };
    
    onSaveRule(newRule);
    
    // Reset form
    setRuleType("date");
    setOperator("equals");
    setValue("");
    setDateValue(undefined);
  };

  const getOperatorOptions = () => {
    switch(ruleType) {
      case "date":
        return [
          { value: "before", label: "Antes de" },
          { value: "after", label: "Após" },
          { value: "equals", label: "Igual a" }
        ];
      case "status":
        return [
          { value: "equals", label: "É igual a" },
          { value: "not_equals", label: "Não é igual a" }
        ];
      case "source":
        return [
          { value: "equals", label: "É igual a" },
          { value: "not_equals", label: "Não é igual a" }
        ];
      default:
        return [];
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Regras do Funil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label>Tipo de Regra</Label>
                <Select value={ruleType} onValueChange={(val) => setRuleType(val as "date" | "status" | "source")}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo de regra" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">Data de Adição</SelectItem>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="source">Fonte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Operador</Label>
                <Select value={operator} onValueChange={setOperator}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o operador" />
                  </SelectTrigger>
                  <SelectContent>
                    {getOperatorOptions().map(op => (
                      <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {ruleType === "date" ? (
                <div>
                  <Label>Data</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateValue ? format(dateValue, "PPP") : <span>Selecionar data...</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateValue}
                        onSelect={setDateValue}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              ) : ruleType === "status" ? (
                <div>
                  <Label>Status</Label>
                  <Select value={value as string} onValueChange={setValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      {leadStatuses.map(status => (
                        <SelectItem key={status.id} value={status.name}>
                          <div className="flex items-center">
                            <div 
                              className="w-3 h-3 rounded-full mr-2" 
                              style={{ backgroundColor: status.color }}
                            />
                            {status.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div>
                  <Label>Fonte</Label>
                  <Select value={value as string} onValueChange={setValue}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a fonte" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourcesOptions.map(source => (
                        <SelectItem key={source} value={source}>{source}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <Button onClick={handleAddRule} className="mt-2">
                <PlusCircle className="h-4 w-4 mr-2" />
                Adicionar Regra
              </Button>
            </div>

            {existingRules.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">Regras Aplicadas</h3>
                <div className="space-y-2">
                  {existingRules.map(rule => (
                    <div key={rule.id} className="flex items-center justify-between bg-muted p-2 rounded-md">
                      <div>
                        {rule.type === "date" && (
                          <Badge variant="secondary">
                            Data de Adição {operator === "before" ? "antes de" : operator === "after" ? "após" : "igual a"} {
                              format(rule.value as Date, "dd/MM/yyyy")
                            }
                          </Badge>
                        )}
                        {rule.type === "status" && (
                          <Badge variant="secondary">
                            Status {operator === "equals" ? "é" : "não é"} {rule.value}
                          </Badge>
                        )}
                        {rule.type === "source" && (
                          <Badge variant="secondary">
                            Fonte {operator === "equals" ? "é" : "não é"} {rule.value}
                          </Badge>
                        )}
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => onRemoveRule(rule.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RuleForm;
