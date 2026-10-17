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

float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.45, 1.0, length((p-c)/r));
}
float ribbon(float d, float width, float aa) {
    return 1.0-smoothstep(width, width+aa, abs(d));
}

void main() {
    vec2 p = vec2(v_uv.x, 1.0-v_uv.y);
    vec4 scan = texture2D(u_card,v_uv);
    float aa = max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t = max(u_time,0.0);
    float seed = fract(u_seed*0.137)*6.2831853;
    // Entire title/class strip and all bottom shields/roots remain original.
    float art = smoothstep(0.147,0.163,p.y)*(1.0-smoothstep(0.532,0.550,p.y));
    art *= smoothstep(0.020,0.040,p.x)*(1.0-smoothstep(0.958,0.980,p.x));
    vec3 color = scan.rgb;

    // Healing sap travels upward around the actual central tall tree.
    float h = clamp((0.456-p.y)/0.275,0.0,1.0);
    float vertical = smoothstep(0.173,0.203,p.y)*(1.0-smoothstep(0.442,0.472,p.y));
    float trunkX = 0.415-0.024*h+0.017*sin(h*6.0);
    float sap = 0.0;
    for (int j=0;j<3;j++) {
        float k = float(j);
        float x = trunkX+sin(h*13.0-t*1.45+k*2.094+seed)*0.043;
        float front = 0.35+0.65*pow(0.5+0.5*sin(h*18.0-t*3.6+k*2.1),3.0);
        sap += ribbon(p.x-x,0.0016,aa*0.80)*front*vertical;
    }
    color += vec3(0.12,0.36,0.075)*sap;
    float roots = oval(p,vec2(0.435,0.449),vec2(0.190,0.071));
    float rootWave = pow(0.5+0.5*sin(length((p-vec2(0.424,0.423))*vec2(1.0,1.41))*78.0-t*3.6),5.0);
    color += vec3(0.055,0.17,0.012)*roots*(0.28+rootWave);

    // Forest wind bends the sunbeams in the open clearing to the right.
    float clearing = oval(p,vec2(0.802,0.325),vec2(0.218,0.225));
    float shafts = pow(0.5+0.5*sin((p.x+p.y*0.25)*65.0+sin(p.y*13.0-t*0.7)*0.60-t*0.32),12.0);
    color += vec3(0.075,0.13,0.105)*shafts*clearing;
    float mist = sin(p.x*15.0+p.y*32.0-t*1.2+seed)*sin(p.x*8.0-p.y*21.0+t*0.75);
    color += vec3(0.012,0.042,0.039)*mist*clearing;

    // Large readable leaf silhouettes lift from the living roots into the crown.
    for (int i=0;i<14;i++) {
        float k = float(i);
        float f = fract(k*0.618034+t*(0.105+0.006*mod(k,3.0))+seed*0.04);
        float a = f*10.0+k*2.4+seed;
        vec2 c = vec2(0.422+sin(a)*(0.055+f*0.155),0.474-f*0.282);
        vec2 q = (p-c)*vec2(1.0,1.4113);
        float turn = a*0.7+t*1.15;
        q = mat2(cos(turn),-sin(turn),sin(turn),cos(turn))*q;
        float size = 0.010+0.003*mod(k,3.0);
        float d = length(q/vec2(size,size*0.40));
        float leaf = (1.0-smoothstep(0.65,1.0+aa/size,d))*smoothstep(0.0,0.10,f)*(1.0-smoothstep(0.86,1.0,f));
        float flutter = 0.5+0.5*sin(t*4.0+k*1.7);
        vec3 leafColor = mix(vec3(0.12,0.29,0.035),vec3(0.68,0.74,0.16),flutter);
        color = mix(color,leafColor,leaf*0.84);
        float glow = exp(-length((p-c)*vec2(1.0,1.4113))/0.017)*leaf*0.18;
        color += vec3(0.20,0.40,0.02)*glow;
    }

    if (u_is_foil) {
        // A persistent patina follows bark, crown and illuminated forest floor.
        float tree = oval(p,vec2(0.409,0.328),vec2(0.120,0.199));
        float crown = oval(p,vec2(0.433,0.190),vec2(0.256,0.105));
        float finish = clamp(0.30+tree*0.30+crown*0.22+roots*0.25,0.0,0.78);
        float phase = p.x*1.80+p.y*2.35+0.12*t+seed*0.07;
        vec3 hue = 0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 metal = mix(2.0*color*hue,1.0-2.0*(1.0-color)*(1.0-hue),step(vec3(0.5),color));
        color = mix(color,metal,finish);
        float stripe = pow(0.5+0.5*sin(p.x*18.0+p.y*24.0-t*1.4+seed),14.0);
        color += (1.0-color)*(vec3(0.12,0.16,0.035)+hue*0.29)*stripe*(0.35+tree+roots*0.5);
        color += vec3(0.20,0.13,0.025)*sap*0.40;
    }
    gl_FragColor = vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
