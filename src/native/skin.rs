//! A single shared material shader. No textures, readbacks or offscreen passes.
use eframe::{
    egui::{self, Color32, FontFamily, FontId, RichText, Stroke},
    egui_glow::{
        self,
        glow::{self, HasContext},
    },
};
use std::sync::{Arc, Mutex};
pub const GOLD: Color32 = Color32::from_rgb(215, 177, 104);
pub const INK: Color32 = Color32::from_rgb(58, 43, 29);
pub const MUTED: Color32 = Color32::from_rgb(117, 91, 60);
#[derive(Clone, Copy)]
pub enum Material {
    Wood,
    Paper,
    Leather,
    Bronze,
}
struct Program {
    program: glow::Program,
    vao: glow::VertexArray,
    uniforms: [Option<glow::UniformLocation>; 5],
}
#[derive(Default)]
struct MapDrift {
    phase: f64,
    last_time: Option<f64>,
    running: bool,
}
impl MapDrift {
    fn update(&mut self, time: f64, enabled: bool) {
        if enabled
            && self.running
            && let Some(previous) = self.last_time
        {
            // Pause time and long stalls never turn into a visible jump on return.
            let dt = (time - previous).clamp(0.0, 0.25);
            self.phase =
                (self.phase + dt * std::f64::consts::TAU / 120.0).rem_euclid(std::f64::consts::TAU);
        }
        self.last_time = Some(time);
        self.running = enabled;
    }
    fn offset(&self) -> egui::Vec2 {
        // Two-minute orbit, at most 1.26 logical points/second. Paper stays fixed.
        egui::vec2(
            (self.phase.sin() * 24.0) as f32,
            ((self.phase.cos() - 1.0) * 14.0) as f32,
        )
    }
}
#[derive(Default)]
pub struct Skin {
    program: Option<Program>,
    attempted: bool,
    pub error: Option<String>,
    map_drift: MapDrift,
}
impl Skin {
    pub fn update_map_motion(&mut self, time: f64, enabled: bool) -> bool {
        let enabled = enabled && self.error.is_none();
        self.map_drift.update(time, enabled);
        enabled
    }
    pub fn prepare(&mut self, gl: &glow::Context) {
        if self.attempted {
            return;
        }
        self.attempted = true;
        match unsafe { Self::compile(gl) } {
            Ok(p) => self.program = Some(p),
            Err(e) => self.error = Some(e),
        }
    }
    unsafe fn compile(gl: &glow::Context) -> Result<Program, String> {
        // SAFETY: eframe supplies a current context on its rendering thread.
        unsafe {
            let prefix = if gl.version().is_embedded {
                "#version 300 es\nprecision highp float;\n"
            } else {
                "#version 330\n"
            };
            let program = gl.create_program()?;
            for (kind, source) in [
                (
                    glow::VERTEX_SHADER,
                    "out vec2 v_uv; void main(){ vec2 p=vec2((gl_VertexID==1||gl_VertexID==4||gl_VertexID==5)?1.0:-1.0,(gl_VertexID>=2&&gl_VertexID!=4)?1.0:-1.0); v_uv=p*.5+.5; gl_Position=vec4(p,0,1); }",
                ),
                (glow::FRAGMENT_SHADER, include_str!("shaders/material.frag")),
            ] {
                let shader = gl.create_shader(kind)?;
                gl.shader_source(shader, &format!("{prefix}{source}"));
                gl.compile_shader(shader);
                if !gl.get_shader_compile_status(shader) {
                    let e = gl.get_shader_info_log(shader);
                    gl.delete_shader(shader);
                    gl.delete_program(program);
                    return Err(e);
                }
                gl.attach_shader(program, shader);
                gl.delete_shader(shader);
            }
            gl.link_program(program);
            if !gl.get_program_link_status(program) {
                let e = gl.get_program_info_log(program);
                gl.delete_program(program);
                return Err(e);
            }
            let vao = gl.create_vertex_array()?;
            Ok(Program {
                program,
                vao,
                uniforms: ["u_size", "u_pointer", "u_kind", "u_active", "u_map_offset"]
                    .map(|s| gl.get_uniform_location(program, s)),
            })
        }
    }
    pub fn paint(
        engine: &Arc<Mutex<Self>>,
        ui: &egui::Ui,
        rect: egui::Rect,
        material: Material,
        active: f32,
    ) {
        if !ui.is_rect_visible(rect) {
            return;
        }
        let fallback = match material {
            Material::Wood => Color32::from_rgb(53, 31, 18),
            Material::Paper => Color32::from_rgb(209, 187, 146),
            Material::Leather => Color32::from_rgb(27, 34, 31),
            Material::Bronze => Color32::from_rgb(98, 70, 32),
        };
        ui.painter().rect_filled(rect, 0.0, fallback);
        let engine = engine.clone();
        let pointer = ui
            .input(|i| i.pointer.hover_pos())
            .map(|p| (p - rect.min) / rect.size())
            .unwrap_or(egui::vec2(0.5, 0.3));
        ui.painter().add(egui::PaintCallback {
            rect,
            callback: Arc::new(egui_glow::CallbackFn::new(move |info, painter| {
                let gl = painter.gl();
                let mut skin = engine.lock().unwrap();
                skin.prepare(gl);
                let Some(p) = &skin.program else {
                    return;
                };
                // SAFETY: callback owns no GL state beyond the draw; egui restores bindings.
                unsafe {
                    viewport(gl, &info);
                    gl.use_program(Some(p.program));
                    gl.bind_vertex_array(Some(p.vao));
                    gl.uniform_2_f32(p.uniforms[0].as_ref(), rect.width(), rect.height());
                    gl.uniform_2_f32(p.uniforms[1].as_ref(), pointer.x, pointer.y);
                    gl.uniform_1_f32(p.uniforms[2].as_ref(), material as u8 as f32);
                    gl.uniform_1_f32(p.uniforms[3].as_ref(), active);
                    let offset = skin.map_drift.offset();
                    gl.uniform_2_f32(p.uniforms[4].as_ref(), offset.x, offset.y);
                    gl.draw_arrays(glow::TRIANGLES, 0, 6);
                    gl.bind_vertex_array(None);
                }
            })),
        });
    }
    pub fn destroy(&mut self, gl: &glow::Context) {
        if let Some(p) = self.program.take() {
            unsafe {
                gl.delete_program(p.program);
                gl.delete_vertex_array(p.vao);
            }
        }
    }
}
pub fn heading(text: impl Into<String>, size: f32) -> RichText {
    RichText::new(text).font(FontId::new(size, FontFamily::Name("book".into())))
}
pub fn configure(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert(
        "book".into(),
        Arc::new(egui::FontData::from_static(include_bytes!(
            "../../assets/fonts/PTSerif-Bold.ttf"
        ))),
    );
    fonts
        .families
        .insert(FontFamily::Name("book".into()), vec!["book".into()]);
    ctx.set_fonts(fonts);
    ctx.set_theme(egui::Theme::Dark);
    ctx.global_style_mut(|s| {
        s.spacing.item_spacing = egui::vec2(10.0, 8.0);
        s.spacing.button_padding = egui::vec2(12.0, 8.0);
        s.spacing.interact_size = egui::vec2(36.0, 32.0);
        s.text_styles
            .insert(egui::TextStyle::Body, FontId::proportional(14.0));
        s.text_styles
            .insert(egui::TextStyle::Button, FontId::proportional(14.0));
        s.text_styles.insert(
            egui::TextStyle::Heading,
            FontId::new(23.0, FontFamily::Name("book".into())),
        );
        let v = &mut s.visuals;
        *v = egui::Visuals::dark();
        v.override_text_color = Some(Color32::from_rgb(224, 211, 181));
        v.panel_fill = Color32::from_rgb(29, 35, 31);
        v.window_fill = Color32::from_rgb(35, 41, 36);
        v.extreme_bg_color = Color32::from_rgb(19, 25, 22);
        v.window_stroke = Stroke::new(1.0, Color32::from_rgb(126, 99, 55));
        v.selection.bg_fill = Color32::from_rgb(106, 83, 44);
        v.selection.stroke = Stroke::new(1.0, GOLD);
        v.hyperlink_color = GOLD;
        for w in [
            &mut v.widgets.inactive,
            &mut v.widgets.hovered,
            &mut v.widgets.active,
            &mut v.widgets.open,
        ] {
            w.corner_radius = 4.into();
            w.bg_stroke = Stroke::new(1.0, Color32::from_rgb(104, 90, 59));
            w.fg_stroke = Stroke::new(1.0, Color32::from_rgb(234, 218, 185));
        }
        v.widgets.inactive.bg_fill = Color32::from_rgb(48, 52, 43);
        v.widgets.inactive.weak_bg_fill = v.widgets.inactive.bg_fill;
        v.widgets.hovered.bg_fill = Color32::from_rgb(84, 76, 51);
        v.widgets.hovered.weak_bg_fill = v.widgets.hovered.bg_fill;
        v.widgets.active.bg_fill = Color32::from_rgb(103, 82, 43);
        v.widgets.active.weak_bg_fill = v.widgets.active.bg_fill;
    });
}
pub fn paper_style(ui: &mut egui::Ui) {
    let v = &mut ui.style_mut().visuals;
    v.override_text_color = Some(INK);
    v.hyperlink_color = Color32::from_rgb(78, 91, 58);
    v.widgets.noninteractive.fg_stroke = Stroke::new(1.0, MUTED);
    v.extreme_bg_color = Color32::from_rgb(224, 205, 168);
    for w in [
        &mut v.widgets.inactive,
        &mut v.widgets.hovered,
        &mut v.widgets.active,
        &mut v.widgets.open,
    ] {
        w.fg_stroke = Stroke::new(1.0, INK);
        w.bg_stroke = Stroke::new(1.0, Color32::from_rgb(151, 122, 79));
    }
    v.widgets.inactive.bg_fill = Color32::from_rgb(201, 176, 131);
    v.widgets.inactive.weak_bg_fill = v.widgets.inactive.bg_fill;
    v.widgets.hovered.bg_fill = Color32::from_rgb(232, 208, 158);
    v.widgets.hovered.weak_bg_fill = v.widgets.hovered.bg_fill;
    v.widgets.active.bg_fill = Color32::from_rgb(183, 151, 98);
    v.widgets.active.weak_bg_fill = v.widgets.active.bg_fill;
    v.selection.bg_fill = Color32::from_rgb(182, 151, 100);
    v.selection.stroke = Stroke::new(1.0, INK);
}
pub fn button(
    skin: &Arc<Mutex<Skin>>,
    ui: &mut egui::Ui,
    label: &str,
    size: egui::Vec2,
    selected: bool,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(size, egui::Sense::click());
    response.widget_info(|| {
        egui::WidgetInfo::selected(
            egui::WidgetType::SelectableLabel,
            ui.is_enabled(),
            selected,
            label,
        )
    });
    if ui.is_rect_visible(rect) {
        let down = response.is_pointer_button_down_on();
        let r = rect.translate(egui::vec2(0.0, if down { 2.0 } else { 0.0 }));
        ui.painter().rect_filled(
            rect.translate(egui::vec2(0.0, 3.0)),
            4.0,
            Color32::from_black_alpha(95),
        );
        Skin::paint(
            skin,
            ui,
            r,
            Material::Bronze,
            if response.hovered() || selected {
                1.0
            } else {
                0.0
            },
        );
        if selected || response.has_focus() {
            ui.painter().rect_stroke(
                r.shrink(2.0),
                2.0,
                Stroke::new(1.0, GOLD),
                egui::StrokeKind::Inside,
            );
        }
        ui.painter().text(
            r.center() + egui::vec2(0.0, 1.0),
            egui::Align2::CENTER_CENTER,
            label,
            FontId::proportional(14.0),
            Color32::from_rgb(240, 222, 180).gamma_multiply(if ui.is_enabled() {
                1.0
            } else {
                0.4
            }),
        );
    }
    response.on_hover_cursor(egui::CursorIcon::PointingHand)
}
pub fn ornament(ui: &mut egui::Ui, rect: egui::Rect) {
    let p = ui.painter();
    let c = Color32::from_rgb(132, 102, 55);
    p.rect_stroke(
        rect.shrink(3.0),
        3.0,
        Stroke::new(1.0, c),
        egui::StrokeKind::Inside,
    );
    for corner in [
        rect.left_top(),
        rect.right_top(),
        rect.left_bottom(),
        rect.right_bottom(),
    ] {
        let inward = (rect.center() - corner).normalized() * 12.0;
        let center = corner + inward;
        p.circle_filled(
            center + egui::vec2(0.0, 1.0),
            3.5,
            Color32::from_black_alpha(130),
        );
        p.circle_filled(center, 2.5, GOLD);
        p.circle_filled(
            center - egui::vec2(0.7, 0.7),
            0.8,
            Color32::from_rgb(246, 217, 151),
        );
    }
}

// egui's convenience viewport clips to the screen. A partially visible card must
// retain its full viewport, otherwise GL scales the whole image into the sliver.
// The existing egui scissor still clips drawing to the scroll container.
pub unsafe fn viewport(gl: &glow::Context, info: &egui::PaintCallbackInfo) {
    let r = info.viewport;
    let scale = info.pixels_per_point;
    let left = (r.left() * scale).round() as i32;
    let right = (r.right() * scale).round() as i32;
    let top = (r.top() * scale).round() as i32;
    let bottom = (r.bottom() * scale).round() as i32;
    unsafe {
        gl.viewport(
            left,
            info.screen_size_px[1] as i32 - bottom,
            right - left,
            bottom - top,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_drift_is_slow_bounded_and_resumes_without_jumping() {
        let mut drift = MapDrift::default();
        drift.update(0.0, true);
        let mut previous = drift.offset();
        for frame in 1..=1800 {
            drift.update(frame as f64 / 15.0, true);
            let offset = drift.offset();
            assert!((offset - previous).length() < 0.085);
            assert!(offset.x.abs() <= 24.0 && offset.y >= -28.0 && offset.y <= 0.0);
            previous = offset;
        }
        assert!(drift.offset().length() < 0.001, "orbit closes smoothly");
        drift.update(120.1, true);
        let frozen = drift.offset();
        drift.update(121.0, false);
        drift.update(3600.0, false);
        assert_eq!(drift.offset(), frozen);
        drift.update(7200.0, true);
        assert_eq!(drift.offset(), frozen, "resume excludes all paused time");
        drift.update(7200.0 + 1.0 / 15.0, true);
        assert!((drift.offset() - frozen).length() < 0.085);
        assert_ne!(drift.offset(), frozen);
        let before_stall = drift.offset();
        drift.update(10000.0, true);
        assert!((drift.offset() - before_stall).length() < 0.32);
    }
}
