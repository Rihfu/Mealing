// Types générés depuis le schéma Supabase (Phase 0).
// Régénérer après toute migration :
//   npx supabase gen types typescript --project-id wbnyngsngppwlsggkorm > src/lib/supabase/database.types.ts
// (ou via le connecteur Supabase / le dashboard).

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      conservation_rule: {
        Row: {
          created_at: string
          food_category: string
          id: string
          opened_days: number | null
          unopened_days: number | null
        }
        Insert: {
          created_at?: string
          food_category: string
          id?: string
          opened_days?: number | null
          unopened_days?: number | null
        }
        Update: {
          created_at?: string
          food_category?: string
          id?: string
          opened_days?: number | null
          unopened_days?: number | null
        }
        Relationships: []
      }
      conversation_ia: {
        Row: {
          content: string
          created_at: string
          id: string
          profile_id: string
          role: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          profile_id: string
          role: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_ia_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      day_off_plan: {
        Row: {
          created_at: string
          household_id: string
          id: string
          off_date: string
          profile_id: string | null
          scope: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          off_date: string
          profile_id?: string | null
          scope: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          off_date?: string
          profile_id?: string | null
          scope?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_off_plan_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_off_plan_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      food: {
        Row: {
          barcode: string | null
          base_amount: number
          created_at: string
          created_by: string | null
          default_unit: string
          external_id: string | null
          id: string
          name: string
          source: string
        }
        Insert: {
          barcode?: string | null
          base_amount?: number
          created_at?: string
          created_by?: string | null
          default_unit?: string
          external_id?: string | null
          id?: string
          name: string
          source: string
        }
        Update: {
          barcode?: string | null
          base_amount?: number
          created_at?: string
          created_by?: string | null
          default_unit?: string
          external_id?: string | null
          id?: string
          name?: string
          source?: string
        }
        Relationships: []
      }
      household: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      household_invitation: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          household_id: string
          id: string
          invited_by: string | null
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          household_id: string
          id?: string
          invited_by?: string | null
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          household_id?: string
          id?: string
          invited_by?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_invitation_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrient_type: {
        Row: {
          category: string
          code: string
          created_at: string
          id: string
          is_base: boolean
          name: string
          unit: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          id?: string
          is_base?: boolean
          name: string
          unit: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          id?: string
          is_base?: boolean
          name?: string
          unit?: string
        }
        Relationships: []
      }
      nutrient_value: {
        Row: {
          amount: number
          created_at: string
          food_id: string
          id: string
          nutrient_type_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          food_id: string
          id?: string
          nutrient_type_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          food_id?: string
          id?: string
          nutrient_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrient_value_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrient_value_nutrient_type_id_fkey"
            columns: ["nutrient_type_id"]
            isOneToOne: false
            referencedRelation: "nutrient_type"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_share: {
        Row: {
          created_at: string
          owner_profile_id: string
          viewer_profile_id: string
        }
        Insert: {
          created_at?: string
          owner_profile_id: string
          viewer_profile_id: string
        }
        Update: {
          created_at?: string
          owner_profile_id?: string
          viewer_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrition_share_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrition_share_viewer_profile_id_fkey"
            columns: ["viewer_profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_meal: {
        Row: {
          created_at: string
          free_text: string | null
          household_id: string
          id: string
          individual_profile_id: string | null
          is_individual: boolean
          leftover_source_meal_id: string | null
          meal_date: string
          produces_leftover: boolean
          recipe_id: string | null
          slot: string
          total_quantity_prepared: number | null
          total_quantity_unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          free_text?: string | null
          household_id: string
          id?: string
          individual_profile_id?: string | null
          is_individual?: boolean
          leftover_source_meal_id?: string | null
          meal_date: string
          produces_leftover?: boolean
          recipe_id?: string | null
          slot: string
          total_quantity_prepared?: number | null
          total_quantity_unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          free_text?: string | null
          household_id?: string
          id?: string
          individual_profile_id?: string | null
          is_individual?: boolean
          leftover_source_meal_id?: string | null
          meal_date?: string
          produces_leftover?: boolean
          recipe_id?: string | null
          slot?: string
          total_quantity_prepared?: number | null
          total_quantity_unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_meal_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_meal_individual_profile_id_fkey"
            columns: ["individual_profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_meal_leftover_source_meal_id_fkey"
            columns: ["leftover_source_meal_id"]
            isOneToOne: false
            referencedRelation: "planned_meal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_meal_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
        ]
      }
      profile: {
        Row: {
          created_at: string
          display_name: string
          household_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          household_id?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          household_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_goal: {
        Row: {
          created_at: string
          id: string
          nutrient_type_id: string
          period: string
          profile_id: string
          target_max: number | null
          target_min: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nutrient_type_id: string
          period?: string
          profile_id: string
          target_max?: number | null
          target_min?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nutrient_type_id?: string
          period?: string
          profile_id?: string
          target_max?: number | null
          target_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_goal_nutrient_type_id_fkey"
            columns: ["nutrient_type_id"]
            isOneToOne: false
            referencedRelation: "nutrient_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_goal_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_nutrient_tracking: {
        Row: {
          nutrient_type_id: string
          profile_id: string
        }
        Insert: {
          nutrient_type_id: string
          profile_id: string
        }
        Update: {
          nutrient_type_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_nutrient_tracking_nutrient_type_id_fkey"
            columns: ["nutrient_type_id"]
            isOneToOne: false
            referencedRelation: "nutrient_type"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_nutrient_tracking_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      real_consumption: {
        Row: {
          actual_free_text: string | null
          actual_recipe_id: string | null
          consumed_at: string
          created_at: string
          id: string
          planned_meal_id: string | null
          profile_id: string
          quantity_consumed: number | null
          quantity_unit: string | null
          status: string
        }
        Insert: {
          actual_free_text?: string | null
          actual_recipe_id?: string | null
          consumed_at?: string
          created_at?: string
          id?: string
          planned_meal_id?: string | null
          profile_id: string
          quantity_consumed?: number | null
          quantity_unit?: string | null
          status?: string
        }
        Update: {
          actual_free_text?: string | null
          actual_recipe_id?: string | null
          consumed_at?: string
          created_at?: string
          id?: string
          planned_meal_id?: string | null
          profile_id?: string
          quantity_consumed?: number | null
          quantity_unit?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_consumption_actual_recipe_id_fkey"
            columns: ["actual_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_consumption_planned_meal_id_fkey"
            columns: ["planned_meal_id"]
            isOneToOne: false
            referencedRelation: "planned_meal"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_consumption_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe: {
        Row: {
          cook_time_min: number | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          instructions: string | null
          name: string
          prep_time_min: number | null
          servings: number
          updated_at: string
        }
        Insert: {
          cook_time_min?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          instructions?: string | null
          name: string
          prep_time_min?: number | null
          servings?: number
          updated_at?: string
        }
        Update: {
          cook_time_min?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          instructions?: string | null
          name?: string
          prep_time_min?: number | null
          servings?: number
          updated_at?: string
        }
        Relationships: []
      }
      recipe_ingredient: {
        Row: {
          food_id: string | null
          free_text: string | null
          id: string
          position: number
          quantity: number | null
          recipe_id: string
          unit: string | null
        }
        Insert: {
          food_id?: string | null
          free_text?: string | null
          id?: string
          position?: number
          quantity?: number | null
          recipe_id: string
          unit?: string | null
        }
        Update: {
          food_id?: string | null
          free_text?: string | null
          id?: string
          position?: number
          quantity?: number | null
          recipe_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredient_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredient_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_tag: {
        Row: {
          recipe_id: string
          tag: string
        }
        Insert: {
          recipe_id: string
          tag: string
        }
        Update: {
          recipe_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_tag_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_item_state: {
        Row: {
          checked: boolean
          checked_at: string | null
          household_id: string
          item_key: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          household_id: string
          item_key: string
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          household_id?: string
          item_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_item_state_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_manual_item: {
        Row: {
          added_at: string
          checked: boolean
          household_id: string
          id: string
          label: string
          quantity: number | null
          unit: string | null
        }
        Insert: {
          added_at?: string
          checked?: boolean
          household_id: string
          id?: string
          label: string
          quantity?: number | null
          unit?: string | null
        }
        Update: {
          added_at?: string
          checked?: boolean
          household_id?: string
          id?: string
          label?: string
          quantity?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_manual_item_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_recurring_item: {
        Row: {
          created_at: string
          default_quantity: number | null
          food_id: string | null
          household_id: string
          id: string
          label: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          default_quantity?: number | null
          food_id?: string | null
          household_id: string
          id?: string
          label?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          default_quantity?: number | null
          food_id?: string | null
          household_id?: string
          id?: string
          label?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_recurring_item_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_recurring_item_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      stock: {
        Row: {
          conservation_rule_id: string | null
          created_at: string
          date_ouverture: string | null
          food_id: string | null
          household_id: string
          id: string
          label: string | null
          present: boolean
          quantity: number | null
          tracking_mode: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          conservation_rule_id?: string | null
          created_at?: string
          date_ouverture?: string | null
          food_id?: string | null
          household_id: string
          id?: string
          label?: string | null
          present?: boolean
          quantity?: number | null
          tracking_mode?: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          conservation_rule_id?: string | null
          created_at?: string
          date_ouverture?: string | null
          food_id?: string | null
          household_id?: string
          id?: string
          label?: string | null
          present?: boolean
          quantity?: number | null
          tracking_mode?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_conservation_rule_id_fkey"
            columns: ["conservation_rule_id"]
            isOneToOne: false
            referencedRelation: "conservation_rule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view_profile_nutrition: { Args: { target: string }; Returns: boolean }
      current_household_id: { Args: Record<PropertyKey, never>; Returns: string }
      is_household_member: { Args: { hid: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
