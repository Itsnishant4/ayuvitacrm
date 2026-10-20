import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { ChevronRight } from "lucide-react"

export function NavMain({
  items,
  onNavigate
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <Collapsible key={item.title} asChild defaultOpen={item.isActive}>
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton 
                  asChild 
                  tooltip={item.title}
                  onClick={(e) => {
                    if (item.view) {
                      e.preventDefault();
                      onNavigate?.(item.view);
                    }
                  }}
                >
                  <a href={item.url || "#"}>
                    {item.icon}
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </CollapsibleTrigger>
              {item.items?.length ? (
                <>
                    <SidebarMenuAction className="data-[state=open]:rotate-90">
                      <ChevronRight className="size-4" />
                      <span className="sr-only">Toggle</span>
                    </SidebarMenuAction>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton 
                            asChild
                            onClick={(e) => {
                              if (subItem.view) {
                                e.preventDefault();
                                onNavigate?.(subItem.view);
                              }
                            }}
                          >
                            <a href={subItem.url || "#"}>
                              <span>{subItem.title}</span>
                            </a>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </>
              ) : null}
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
