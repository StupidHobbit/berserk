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

float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.10,1.0,length((p-c)/r));
}
float lineDist(vec2 p,vec2 a,vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
float hash(float n) { return fract(sin(n*127.1+19.7)*43758.5453); }

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.x,1.0);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.283185;
    // The illustration starts below the class strip and ends before the
    // spikes of the printed statistic frame. No sampled-pixel displacement.
    float art=smoothstep(0.140,0.153,p.y)*(1.0-smoothstep(0.536,0.548,p.y));
    art*=smoothstep(0.003,0.018,p.x)*(1.0-smoothstep(0.982,0.997,p.x));
    vec3 col=scan.rgb;
    float face=oval(p,vec2(0.562,0.190),vec2(0.073,0.065));
    // A burning sentence runs around the engraved executioner's axe.
    // This small broken seal echoes the mark of Segger from the rules.
    vec2 q=(p-vec2(0.298,0.266))*vec2(1.0,1.42);
    float r=length(q);
    float angle=atan(q.y,q.x);
    float ring=1.0-smoothstep(0.0025,0.006+aa*0.35,abs(r-0.077));
    float runes=smoothstep(0.2,0.55,sin(angle*9.0+0.5));
    float travel=pow(0.5+0.5*cos(angle-t*3.5-seed),5.0);
    float seal=ring*runes*(0.22+0.78*travel);
    float cross=max(1.0-smoothstep(0.002,0.005+aa*0.3,lineDist(q,vec2(-0.037,-0.038),vec2(0.029,0.037))),
                    1.0-smoothstep(0.002,0.005+aa*0.3,lineDist(q,vec2(0.030,-0.034),vec2(-0.024,0.030))));
    seal+=cross*(0.22+0.32*(0.5+0.5*sin(t*3.4+seed)));
    col+=vec3(1.0,0.26,0.025)*seal*0.78;
    col+=(1.0-col)*vec3(1.0,0.15,0.012)*exp(-pow((r-0.077)/0.020,2.0))*(0.12+travel*0.36);

    // Fire rises from the background around his silhouette. Each tongue
    // moves in position and bends, remaining readable at thumbnail size.
    float flames=0.0;
    float flameCore=0.0;
    for(int i=0;i<9;i++) {
        float k=float(i);
        float x=0.045+k*0.023;
        if(i>3) x=0.79+(k-4.0)*0.043;
        float start=0.51-0.025*hash(k+seed);
        float height=0.16+0.10*hash(k+4.0);
        float f=(start-p.y)/height;
        float bend=x+0.024*sin(f*8.0-t*2.6+k*1.9)+0.015*sin(f*19.0-t*4.0+k);
        float width=0.018*(1.0-clamp(f,0.0,1.0))+0.003;
        float fade=smoothstep(0.0,0.12,f)*(1.0-smoothstep(0.77,1.0,f));
        float d=abs(p.x-bend);
        flames=max(flames,(1.0-smoothstep(width,width+0.019,d))*fade);
        flameCore=max(flameCore,(1.0-smoothstep(width*0.15,width*0.45+aa*0.35,d))*fade);
    }
    float figure=oval(p,vec2(0.623,0.344),vec2(0.205,0.22));
    float fireMask=(1.0-figure)*(1.0-face);
    col=mix(col,col*vec3(1.10,0.63,0.38),flames*fireMask*0.30);
    col+=(1.0-col)*vec3(1.0,0.36,0.025)*flames*fireMask*0.80;
    col+=vec3(1.0,0.48,0.09)*flameCore*fireMask*0.38;
    // Cinders drift diagonally past the weapon and through the fire.
    float sparks=0.0;
    for(int i=0;i<18;i++) {
        float k=float(i);
        float f=fract(t*(0.24+hash(k+8.0)*0.12)+hash(k*3.0+seed));
        float x=hash(k+31.0);
        vec2 head=vec2(x+0.045*sin(f*6.0+k)-0.08*f,0.542-f*0.38);
        float d=lineDist(p,head,head+vec2(0.009,0.015));
        float fade=smoothstep(0.0,0.12,f)*(1.0-smoothstep(0.87,1.0,f));
        sparks+=(1.0-smoothstep(0.0015,0.0045+aa*0.25,d))*fade;
    }
    col+=vec3(1.0,0.62,0.12)*sparks*0.9*(1.0-face);
    if(u_is_foil) {
        // Copper, violet and blue steel stay visible with time frozen at 0.
        float steel=oval(p,vec2(0.304,0.285),vec2(0.224,0.192))
                   +oval(p,vec2(0.609,0.330),vec2(0.190,0.175));
        float finish=clamp(0.18+steel*0.80,0.0,0.94)*(1.0-face);
        float field=p.x*2.8+p.y*4.1+0.12*sin(p.y*27.0-p.x*12.0)+t*0.11+seed*0.025;
        vec3 irid=0.5+0.5*cos(6.283185*(field+vec3(0.05,0.37,0.70)));
        vec3 metal=mix(2.0*col*irid,1.0-2.0*(1.0-col)*(1.0-irid),step(vec3(0.5),col));
        col=mix(col,metal,finish*0.68);
        float sweep=pow(0.5+0.5*sin(field*10.0-t*1.4),7.0);
        col+=(1.0-col)*mix(vec3(0.94,0.50,0.10),irid,0.65)*finish*(0.12+0.38*sweep);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(col,0.0,1.0),art),scan.a);
}
