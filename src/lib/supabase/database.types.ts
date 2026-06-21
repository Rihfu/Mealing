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
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
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
          conversation_id: string | null
          created_at: string
          id: string
          profile_id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          profile_id: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_ia_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ia_conversation"
            referencedColumns: ["id"]
          },
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
          category: string | null
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
          category?: string | null
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
          category?: string | null
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
      food_conservation: {
        Row: {
          days: Json
          food_id: string
          updated_at: string
        }
        Insert: {
          days?: Json
          food_id: string
          updated_at?: string
        }
        Update: {
          days?: Json
          food_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_conservation_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: true
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
        ]
      }
      food_package: {
        Row: {
          created_at: string
          food_id: string
          id: string
          is_default: boolean
          label: string
          position: number
          quantity: number
          unit: string | null
        }
        Insert: {
          created_at?: string
          food_id: string
          id?: string
          is_default?: boolean
          label: string
          position?: number
          quantity: number
          unit?: string | null
        }
        Update: {
          created_at?: string
          food_id?: string
          id?: string
          is_default?: boolean
          label?: string
          position?: number
          quantity?: number
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "food_package_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
        ]
      }
      household: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          shopping_horizon_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          shopping_horizon_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          shopping_horizon_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      household_food_pref: {
        Row: {
          category_key: string | null
          created_at: string
          display_label: string
          food_id: string | null
          household_id: string
          icon_slug: string | null
          id: string
          label_norm: string
          updated_at: string
        }
        Insert: {
          category_key?: string | null
          created_at?: string
          display_label: string
          food_id?: string | null
          household_id: string
          icon_slug?: string | null
          id?: string
          label_norm: string
          updated_at?: string
        }
        Update: {
          category_key?: string | null
          created_at?: string
          display_label?: string
          food_id?: string | null
          household_id?: string
          icon_slug?: string | null
          id?: string
          label_norm?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_food_pref_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_food_pref_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
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
      household_location_order: {
        Row: {
          household_id: string
          location_key: string
          position: number
          updated_at: string
        }
        Insert: {
          household_id: string
          location_key: string
          position?: number
          updated_at?: string
        }
        Update: {
          household_id?: string
          location_key?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_location_order_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      household_rayon_order: {
        Row: {
          household_id: string
          position: number
          rayon_key: string
          updated_at: string
        }
        Insert: {
          household_id: string
          position?: number
          rayon_key: string
          updated_at?: string
        }
        Update: {
          household_id?: string
          position?: number
          rayon_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_rayon_order_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      household_shopping_order: {
        Row: {
          household_id: string
          item_key: string
          position: number
          updated_at: string
        }
        Insert: {
          household_id: string
          item_key: string
          position?: number
          updated_at?: string
        }
        Update: {
          household_id?: string
          item_key?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_shopping_order_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      ia_conversation: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ia_conversation_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profile"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_pref: {
        Row: {
          created_at: string
          digest_hour: number
          expiry_threshold_days: number
          household_id: string
          last_digest_sent_on: string | null
          push_enabled: boolean
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          digest_hour?: number
          expiry_threshold_days?: number
          household_id: string
          last_digest_sent_on?: string | null
          push_enabled?: boolean
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          digest_hour?: number
          expiry_threshold_days?: number
          household_id?: string
          last_digest_sent_on?: string | null
          push_enabled?: boolean
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_pref_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
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
          stock_applied_at: string | null
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
          stock_applied_at?: string | null
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
          stock_applied_at?: string | null
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
      push_subscription: {
        Row: {
          auth: string
          created_at: string
          enabled: boolean
          endpoint: string
          id: string
          label: string | null
          last_seen_at: string
          p256dh: string
          profile_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          id?: string
          label?: string | null
          last_seen_at?: string
          p256dh: string
          profile_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          id?: string
          label?: string | null
          last_seen_at?: string
          p256dh?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscription_profile_id_fkey"
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
      shopping_category: {
        Row: {
          created_at: string
          household_id: string
          icon_slug: string | null
          id: string
          label: string
          position: number
          tint: string | null
        }
        Insert: {
          created_at?: string
          household_id: string
          icon_slug?: string | null
          id?: string
          label: string
          position?: number
          tint?: string | null
        }
        Update: {
          created_at?: string
          household_id?: string
          icon_slug?: string | null
          id?: string
          label?: string
          position?: number
          tint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_category_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_item_state: {
        Row: {
          checked: boolean
          checked_at: string | null
          dismissed: boolean
          dismissed_at: string | null
          household_id: string
          item_key: string
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          dismissed?: boolean
          dismissed_at?: string | null
          household_id: string
          item_key: string
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          dismissed?: boolean
          dismissed_at?: string | null
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
          food_id: string | null
          household_id: string
          id: string
          label: string
          quantity: number | null
          unit: string | null
        }
        Insert: {
          added_at?: string
          checked?: boolean
          food_id?: string | null
          household_id: string
          id?: string
          label: string
          quantity?: number | null
          unit?: string | null
        }
        Update: {
          added_at?: string
          checked?: boolean
          food_id?: string | null
          household_id?: string
          id?: string
          label?: string
          quantity?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_manual_item_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
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
      shopping_trip: {
        Row: {
          created_at: string
          household_id: string
          id: string
          is_favorite: boolean
          name: string | null
          purchased_at: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          is_favorite?: boolean
          name?: string | null
          purchased_at?: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          is_favorite?: boolean
          name?: string | null
          purchased_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_trip_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_trip_item: {
        Row: {
          category_key: string | null
          food_id: string | null
          icon_slug: string | null
          id: string
          label: string
          price: number | null
          quantity: number | null
          source: string | null
          trip_id: string
          unit: string | null
        }
        Insert: {
          category_key?: string | null
          food_id?: string | null
          icon_slug?: string | null
          id?: string
          label: string
          price?: number | null
          quantity?: number | null
          source?: string | null
          trip_id: string
          unit?: string | null
        }
        Update: {
          category_key?: string | null
          food_id?: string | null
          icon_slug?: string | null
          id?: string
          label?: string
          price?: number | null
          quantity?: number | null
          source?: string | null
          trip_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shopping_trip_item_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_trip_item_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "shopping_trip"
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
          printed_expiry: string | null
          quantity: number | null
          sort_index: number | null
          storage_location: string | null
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
          printed_expiry?: string | null
          quantity?: number | null
          sort_index?: number | null
          storage_location?: string | null
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
          printed_expiry?: string | null
          quantity?: number | null
          sort_index?: number | null
          storage_location?: string | null
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
      stock_event: {
        Row: {
          food_id: string | null
          household_id: string
          id: string
          kind: string
          label: string | null
          occurred_at: string
          quantity: number | null
          source: string | null
          stock_id: string | null
          unit: string | null
        }
        Insert: {
          food_id?: string | null
          household_id: string
          id?: string
          kind: string
          label?: string | null
          occurred_at?: string
          quantity?: number | null
          source?: string | null
          stock_id?: string | null
          unit?: string | null
        }
        Update: {
          food_id?: string | null
          household_id?: string
          id?: string
          kind?: string
          label?: string | null
          occurred_at?: string
          quantity?: number | null
          source?: string | null
          stock_id?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_event_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "food"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_event_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "household"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_event_stock_id_fkey"
            columns: ["stock_id"]
            isOneToOne: false
            referencedRelation: "stock"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_location: {
        Row: {
          created_at: string
          household_id: string
          icon_slug: string | null
          id: string
          label: string
          position: number
        }
        Insert: {
          created_at?: string
          household_id: string
          icon_slug?: string | null
          id?: string
          label: string
          position?: number
        }
        Update: {
          created_at?: string
          household_id?: string
          icon_slug?: string | null
          id?: string
          label?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "storage_location_household_id_fkey"
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
      current_household_id: { Args: never; Returns: string }
      is_household_member: { Args: { hid: string }; Returns: boolean }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
