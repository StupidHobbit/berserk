//! One physical surface shared by ordinary, foil and bespoke cards.
use eframe::egui;

const CORNER: f32 = 0.07;
const TRIM_X: f32 = 0.006;
const TRIM_Y: f32 = TRIM_X * 768.0 / 1088.0;

#[derive(Clone, Copy)]
pub struct Pose {
    pub pitch: f32,
    pub yaw: f32,
    pub lift: f32,
    pub hover: f32,
}
impl Default for Pose {
    fn default() -> Self {
        Self {
            pitch: 0.055,
            yaw: -0.035,
            lift: 0.0,
            hover: 0.0,
        }
    }
}
#[derive(Clone, Copy)]
struct Motion {
    pose: Pose,
    time: f64,
}

pub fn pose(ui: &egui::Ui, response: &egui::Response, reduced: bool) -> Pose {
    if reduced {
        return Pose::default();
    }
    let focused = ui.input(|i| {
        i.viewport().focused.unwrap_or(true) && !i.viewport().minimized.unwrap_or(false)
    });
    let hover = focused && (response.hovered() || response.has_focus());
    let pointer = ui
        .input(|i| i.pointer.hover_pos())
        .filter(|_| hover)
        .map(|p| {
            ((p - response.rect.center()) / response.rect.size())
                .clamp(egui::vec2(-0.5, -0.5), egui::vec2(0.5, 0.5))
        })
        .unwrap_or_default();
    let target = Pose {
        pitch: 0.055 + pointer.y * 0.36,
        yaw: -0.035 + pointer.x * 0.36,
        lift: if hover {
            (response.rect.width() * 0.035).min(10.0)
                * if response.is_pointer_button_down_on() {
                    0.3
                } else {
                    1.0
                }
        } else {
            0.0
        },
        hover: if hover { 1.0 } else { 0.0 },
    };
    let id = response.id.with("card-pose");
    let now = ui.input(|i| i.time);
    let mut state = ui
        .ctx()
        .data_mut(|d| d.get_temp::<Motion>(id))
        .unwrap_or(Motion {
            pose: Pose::default(),
            time: now,
        });
    let blend = 1.0 - (-((now - state.time) as f32).clamp(0.0, 0.1) / 0.055).exp();
    let mut moving = false;
    for (value, target) in [
        (&mut state.pose.pitch, target.pitch),
        (&mut state.pose.yaw, target.yaw),
        (&mut state.pose.lift, target.lift),
        (&mut state.pose.hover, target.hover),
    ] {
        *value += (target - *value) * blend;
        if (*value - target).abs() < 0.0005 {
            *value = target;
        } else {
            moving = true;
        }
    }
    state.time = now;
    ui.ctx().data_mut(|d| d.insert_temp(id, state));
    if moving && focused {
        ui.ctx()
            .request_repaint_after(std::time::Duration::from_millis(33));
    }
    state.pose
}

pub fn bounds(rect: egui::Rect) -> egui::Rect {
    rect.expand(rect.width() * 0.12 + 8.0)
}

// Matches surface.vert, including the camera distance and rotation order.
pub fn project(rect: egui::Rect, pose: Pose, uv: egui::Pos2, depth: f32) -> egui::Pos2 {
    let x = (uv.x - 0.5) * rect.width();
    let y = (0.5 - uv.y) * rect.height();
    let (sy, cy) = pose.yaw.sin_cos();
    let (sx, cx) = pose.pitch.sin_cos();
    let rotated_x = cy * x + sy * depth;
    let z = -sy * x + cy * depth;
    let rotated_y = cx * y - sx * z;
    let rotated_z = sx * y + cx * z;
    let perspective = 1.0 / (1.0 - rotated_z / (rect.width() * 4.0));
    rect.center()
        + egui::vec2(
            rotated_x * perspective,
            -rotated_y * perspective - pose.lift,
        )
}

fn outline(rect: egui::Rect) -> Vec<egui::Pos2> {
    let r = rect.width() * CORNER;
    let mut points = Vec::with_capacity(36);
    for (center, start) in [
        (egui::pos2(r, r), std::f32::consts::PI),
        (egui::pos2(rect.width() - r, r), std::f32::consts::PI * 1.5),
        (egui::pos2(rect.width() - r, rect.height() - r), 0.0),
        (
            egui::pos2(r, rect.height() - r),
            std::f32::consts::FRAC_PI_2,
        ),
    ] {
        for step in 0..=8 {
            let angle = start + step as f32 * std::f32::consts::FRAC_PI_2 / 8.0;
            let p = center + egui::vec2(angle.cos(), angle.sin()) * r;
            points.push(egui::pos2(p.x / rect.width(), p.y / rect.height()));
        }
    }
    points
}

fn shadow(ui: &egui::Ui, points: &[egui::Pos2], offset: egui::Vec2, blur: f32, opacity: u8) {
    let center = points
        .iter()
        .fold(egui::Vec2::ZERO, |sum, p| sum + p.to_vec2())
        / points.len() as f32;
    let mut mesh = egui::Mesh::default();
    let n = points.len() as u32;
    mesh.colored_vertex(
        center.to_pos2() + offset,
        egui::Color32::from_black_alpha(opacity),
    );
    for &p in points {
        mesh.colored_vertex(p + offset, egui::Color32::from_black_alpha(opacity));
    }
    for &p in points {
        mesh.colored_vertex(
            p + offset + (p - center.to_pos2()).normalized() * blur,
            egui::Color32::TRANSPARENT,
        );
    }
    for i in 0..n {
        let a = 1 + i;
        let b = 1 + (i + 1) % n;
        mesh.add_triangle(0, a, b);
        mesh.add_triangle(a, a + n, b + n);
        mesh.add_triangle(a, b + n, b);
    }
    ui.painter().add(mesh);
}

pub fn body(ui: &egui::Ui, rect: egui::Rect, pose: Pose) {
    let uv = outline(rect);
    let front: Vec<_> = uv.iter().map(|&p| project(rect, pose, p, 0.0)).collect();
    let scale = (rect.width() / 220.0).clamp(0.3, 1.4);
    // Broad cast shadow and close contact shadow separate as the card is lifted.
    shadow(
        ui,
        &front,
        egui::vec2(2.0 + pose.lift * 0.3, 5.0 + pose.lift * 0.8) * scale,
        (8.0 + pose.lift * 0.6) * scale,
        38,
    );
    shadow(
        ui,
        &front,
        egui::vec2(0.5, 1.5) * scale,
        3.0 * scale,
        (42.0 - pose.hover * 25.0) as u8,
    );
    let back: Vec<_> = uv
        .iter()
        .map(|&p| project(rect, pose, p, -2.0 * scale) + egui::vec2(0.35, 0.8) * scale)
        .collect();
    // Exposed cut cardstock, exactly the card footprint: no expanded plate or outline.
    ui.painter().add(egui::Shape::convex_polygon(
        back,
        egui::Color32::from_rgb(107, 91, 67),
        egui::Stroke::NONE,
    ));
}

pub fn image(ui: &egui::Ui, texture: egui::TextureId, rect: egui::Rect, pose: Pose) {
    let uv = outline(rect);
    let mut mesh = egui::Mesh::with_texture(texture);
    for p in std::iter::once(egui::pos2(0.5, 0.5)).chain(uv.iter().copied()) {
        mesh.vertices.push(egui::epaint::Vertex {
            pos: project(rect, pose, p, 0.0),
            uv: egui::pos2(
                TRIM_X + p.x * (1.0 - 2.0 * TRIM_X),
                TRIM_Y + p.y * (1.0 - 2.0 * TRIM_Y),
            ),
            color: egui::Color32::WHITE,
        });
    }
    for i in 0..uv.len() as u32 {
        mesh.add_triangle(0, 1 + i, 1 + (i + 1) % uv.len() as u32);
    }
    ui.painter().add(mesh);
}

pub fn shader() -> String {
    format!(
        "vec2 scan_uv(vec2 uv) {{ return mix(vec2({TRIM_X}, {TRIM_Y}), vec2(1.0-{TRIM_X}, 1.0-{TRIM_Y}), uv); }}\n\
         float card_coverage(vec2 uv) {{\n\
         vec2 size=vec2(1.0, 1088.0/768.0);\n\
         vec2 q=abs((uv-0.5)*size)-(size*0.5-vec2({CORNER}));\n\
         float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-{CORNER};\n\
         return 1.0-smoothstep(-fwidth(d),0.0,d);\n\
         }}\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifted_cards_stay_inside_their_gpu_viewport_at_every_size() {
        for width in [46.0, 74.0, 90.0, 150.0, 250.0, 300.0] {
            let rect = egui::Rect::from_min_size(
                egui::pos2(200.0, -20.0),
                egui::vec2(width, width * 1088.0 / 768.0),
            );
            for pitch in [-0.125, 0.055, 0.235] {
                for yaw in [-0.215, -0.035, 0.145] {
                    let pose = Pose {
                        pitch,
                        yaw,
                        lift: (width * 0.035).min(10.0),
                        hover: 1.0,
                    };
                    for uv in outline(rect) {
                        assert!(
                            bounds(rect).contains(project(rect, pose, uv, 0.0)),
                            "clipped card at width {width}"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn hover_settles_returns_to_rest_and_respects_reduced_motion() {
        let ctx = egui::Context::default();
        let rect = egui::Rect::from_min_size(egui::pos2(50.0, 50.0), egui::vec2(200.0, 283.0));
        let mut value = Pose::default();
        for frame in 0..165 {
            let hovering = !(85..155).contains(&frame);
            let pointer = if hovering {
                rect.min + egui::vec2(170.0, 40.0)
            } else {
                egui::pos2(5.0, 5.0)
            };
            let mut events = vec![egui::Event::PointerMoved(pointer)];
            if frame == 70 || frame == 85 {
                events.push(egui::Event::PointerButton {
                    pos: pointer,
                    button: egui::PointerButton::Primary,
                    pressed: frame == 70,
                    modifiers: egui::Modifiers::NONE,
                });
            }
            let input = egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(
                    egui::Pos2::ZERO,
                    egui::vec2(800.0, 600.0),
                )),
                time: Some(frame as f64 / 30.0),
                focused: true,
                events,
                ..Default::default()
            };
            ctx.run_ui(input, |ui| {
                let response = ui.allocate_rect(rect, egui::Sense::click());
                value = pose(ui, &response, frame >= 155);
            })
            .textures_delta
            .clear();
            if frame == 69 {
                assert!(value.hover > 0.99 && value.lift > 6.9 && value.yaw > 0.08);
            }
            if frame == 84 {
                assert!(
                    (1.9..2.2).contains(&value.lift),
                    "press lowers the lifted card: {}",
                    value.lift
                );
            }
            if frame == 154 || frame == 164 {
                assert_eq!(value.lift, 0.0);
                assert_eq!(value.hover, 0.0);
                assert_eq!(value.pitch, Pose::default().pitch);
                assert_eq!(value.yaw, Pose::default().yaw);
            }
        }
    }
}
