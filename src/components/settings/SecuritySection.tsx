
import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";

export const SecuritySection: React.FC = () => {
  const { t } = useTranslation("settings");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("sec_security")}</CardTitle>
        <CardDescription>{t("security_desc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t("security_change")}</h3>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t("security_current")}</Label>
              <Input id="currentPassword" type="password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("security_new")}</Label>
              <Input id="newPassword" type="password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("security_confirm")}</Label>
              <Input id="confirmPassword" type="password" />
            </div>
            <Button>{t("security_update")}</Button>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium">{t("security_2fa")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("security_2fa_desc")}
                </p>
              </div>
              <Switch id="2fa" />
            </div>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t("security_sessions")}</h3>
            <div className="space-y-2">
              <div className="p-4 border rounded-md">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">Chrome - Windows 10</p>
                    <p className="text-xs text-muted-foreground">{t("security_now")}</p>
                  </div>
                  <p className="text-xs text-green-600">{t("security_current_session")}</p>
                </div>
              </div>
              
              <div className="p-4 border rounded-md">
                <div className="flex justify-between">
                  <div>
                    <p className="font-medium">Safari - iPhone</p>
                    <p className="text-xs text-muted-foreground">{t("security_last")}</p>
                  </div>
                  <Button variant="ghost" size="sm">{t("security_end")}</Button>
                </div>
              </div>
            </div>
            <Button variant="outline">{t("security_end_all")}</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
