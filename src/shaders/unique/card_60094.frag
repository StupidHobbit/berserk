#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Бик: an allied wound provokes two retaliations; stolen strength warms
// his actual brass rings, then gathers in the lowered right claw.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.15,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 d=(b-a)*vec2(1.0,1.41129);
    vec2 q=(p-a)*vec2(1.0,1.41129);
    return length(q-d*clamp(dot(q,d)/dot(d,d),0.0,1.0));
}
float beat(float t, float phase) {
    return pow(0.5+0.5*cos(t*2.1-phase),12.0);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 base=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.41129/max(u_resolution.y,1.0));
    float t=max(0.0,u_time);
    float seed=fract(u_seed*0.127);
    float clock=t+seed*0.28;
    float art=smoothstep(0.143,0.153,p.y)*(1.0-smoothstep(0.542,0.553,p.y));
    art*=smoothstep(0.007,0.018,p.x)*(1.0-smoothstep(0.980,0.993,p.x));
    // Preserve all three circular ability emblems and their small numerals.
    art*=clamp(smoothstep(0.181,0.198,p.x)+smoothstep(0.379,0.392,p.y),0.0,1.0);
    vec3 color=base.rgb;
    float lum=dot(base.rgb,vec3(0.2126,0.7152,0.0722));
    float body=oval(p,vec2(0.518,0.343),vec2(0.249,0.185));
    float face=oval(p,vec2(0.560,0.284),vec2(0.085,0.080));
    float hand=oval(p,vec2(0.775,0.406),vec2(0.067,0.070));
    float anger=beat(clock,0.20)+0.80*beat(clock,1.05);
    float strength=beat(clock,2.70);

    // Two short red cuts stay on the left shoulder; a broad pulse moves
    // down the painted torso and answers with light on the right talons.
    float scars=0.0;
    for(int i=0;i<2;i++) {
        float k=float(i);
        float d=segment(p,vec2(0.352+k*0.022,0.248+k*0.004),
                           vec2(0.389+k*0.022,0.267+k*0.004));
        float pulse=beat(clock,0.20+k*0.85);
        scars+=(1.0-smoothstep(0.0012,0.0030+aa,d)+0.28*exp(-d*d/0.00018))*(0.18+pulse);
    }
    color+=vec3(0.51,0.042,0.018)*scars;
    float moving=pow(0.5+0.5*sin(p.y*24.0+p.x*9.0-clock*2.1),5.0);
    color+=(1.0-color)*vec3(0.39,0.16,0.026)*body*(1.0-face)*(0.07+0.29*moving+0.16*anger);
    float claw=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        float d=segment(p,vec2(0.766+k*0.014,0.411+k*0.003),
                           vec2(0.755+k*0.022,0.435+k*0.005));
        claw+=(1.0-smoothstep(0.0009,0.0020+aa,d))*0.75+exp(-d*d/0.00009)*0.20;
    }
    color+=vec3(0.58,0.29,0.065)*claw*(0.22+strength);
    color+=(1.0-color)*vec3(0.45,0.13,0.025)*hand*(0.08+0.44*strength);

    // Blue-grey breath curls out of the snout and across the chest.
    float mist=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        float h=clamp((0.570-p.x)/0.172,0.0,1.0);
        float center=0.319-0.047*h+0.009*sin(h*8.0-clock*1.4+k*2.1)*h+k*0.003;
        float width=0.004+0.010*h;
        float d=(p.y-center)/width;
        float plume=smoothstep(0.389,0.430,p.x)*(1.0-smoothstep(0.556,0.582,p.x));
        mist+=exp(-d*d)*plume*(0.35+0.65*pow(0.5+0.5*sin(h*8.0-clock*1.8+k),2.0));
    }
    color=mix(color,vec3(0.48,0.72,0.69),clamp(mist*0.20,0.0,0.42));

    float ornaments=oval(p,vec2(0.466,0.231),vec2(0.029,0.030))
                    +oval(p,vec2(0.465,0.333),vec2(0.028,0.023))
                    +oval(p,vec2(0.681,0.255),vec2(0.027,0.021))
                    +oval(p,vec2(0.696,0.285),vec2(0.026,0.023))
                    +oval(p,vec2(0.627,0.369),vec2(0.044,0.041));
    float gold=smoothstep(0.015,0.16,base.r-base.b)*smoothstep(0.13,0.48,lum)*clamp(ornaments,0.0,1.0);
    color+=(1.0-color)*vec3(0.83,0.57,0.12)*gold*(0.25+0.62*strength);
    if(u_is_foil) {
        // The forest has broad interference bands; brass catches much
        // stronger polished highlights. Both finishes persist at t = 0.
        float phase=p.x*1.7+p.y*2.5+0.11*sin(p.y*24.0+p.x*7.0)-t*0.10+seed*0.30;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.333,0.667)));
        vec3 coated=mix(2.0*color*spectrum,
                        1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        float foil=(0.32+body*0.10)*(1.0-face*0.77);
        color=mix(color,coated,foil);
        float sheen=pow(0.5+0.5*sin(p.x*16.0-p.y*23.0+t*1.2),7.0);
        float fur=smoothstep(0.12,0.45,lum)*body*(1.0-face);
        color+=(1.0-color)*mix(vec3(0.80,0.91,0.73),spectrum,0.55)
               *(0.06+0.30*sheen)*(0.40+fur);
        color+=(1.0-color)*mix(vec3(1.0,0.77,0.28),spectrum,0.28)*gold*(0.48+0.52*sheen);
        color+=vec3(0.35,0.48,0.39)*claw*(0.16+0.35*sheen);
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(color,0.0,1.0),art),base.a);
}
